// Reads the signed-in user's Claude plan usage (5-hour session and weekly)
// from claude.ai, the same data shown on claude.ai > Settings > Usage.
// This is an internal claude.ai endpoint, not a public API, so the shape can
// change. Everything here is defensive and nothing leaves the browser.

export const CLAUDE_ORIGIN = "https://claude.ai/*";
const BASE = "https://claude.ai";
const CACHE_KEY = "claudeUsageCache";

export class ClaudeUsageError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "signed_out" | "unavailable"
  }
}

export function hasPermission() {
  return chrome.permissions.contains({ origins: [CLAUDE_ORIGIN] });
}

export function requestPermission() {
  return chrome.permissions.request({ origins: [CLAUDE_ORIGIN] });
}

export function removePermission() {
  return chrome.permissions.remove({ origins: [CLAUDE_ORIGIN] });
}

export async function readCache() {
  const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
  return cache || null;
}

async function writeCache(usage) {
  await chrome.storage.local.set({ [CACHE_KEY]: { usage, at: Date.now() } });
}

export async function clearCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

/* ---------------- Fetching ---------------- */

// Runs inside an open claude.ai tab (same-origin), used as a fallback when a
// direct request from the extension is blocked.
function fetchInPage() {
  const get = async (path) => {
    const res = await fetch(path, { credentials: "include", headers: { accept: "application/json" } });
    return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
  };
  return (async () => {
    const orgs = await get("/api/organizations");
    if (orgs.status !== 200) return { status: orgs.status };
    const list = Array.isArray(orgs.body) ? orgs.body : [];
    for (const org of list) {
      if (!org?.uuid) continue;
      const usage = await get(`/api/organizations/${org.uuid}/usage`);
      if (usage.status === 200 && usage.body?.five_hour !== undefined) {
        return { status: 200, org: { uuid: org.uuid, name: org.name || "", capabilities: org.capabilities || [] }, usage: usage.body };
      }
    }
    return { status: 404 };
  })();
}

async function getJson(path) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new ClaudeUsageError("signed_out", "Not signed in to claude.ai");
  if (!res.ok) throw new ClaudeUsageError("unavailable", `claude.ai returned ${res.status}`);
  return res.json();
}

function orderOrgs(list) {
  // Prefer organizations that can chat (personal and team plans).
  return [...list].sort((a, b) => {
    const score = (o) => (o?.capabilities || []).includes("chat") ? 0 : 1;
    return score(a) - score(b);
  });
}

async function fetchDirect() {
  const orgs = await getJson("/api/organizations");
  if (!Array.isArray(orgs) || !orgs.length) throw new ClaudeUsageError("signed_out", "No Claude organization found");
  for (const org of orderOrgs(orgs)) {
    if (!org?.uuid) continue;
    try {
      const usage = await getJson(`/api/organizations/${org.uuid}/usage`);
      if (usage && usage.five_hour !== undefined) {
        return { org: { uuid: org.uuid, name: org.name || "", capabilities: org.capabilities || [] }, usage };
      }
    } catch (e) {
      if (e.code === "signed_out") continue; // org without access to usage
      throw e;
    }
  }
  throw new ClaudeUsageError("unavailable", "Usage is not available for this account (free plan or API-only account)");
}

async function fetchViaTab() {
  const tabs = await chrome.tabs.query({ url: CLAUDE_ORIGIN });
  const tab = tabs.find((t) => !t.discarded) || null;
  if (!tab) return null;
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: fetchInPage });
  const r = res?.result;
  if (!r) return null;
  if (r.status === 401 || r.status === 403) throw new ClaudeUsageError("signed_out", "Not signed in to claude.ai");
  if (r.status !== 200) return null;
  return { org: r.org, usage: r.usage };
}

/* ---------------- Normalizing ---------------- */

function toWindow(raw) {
  if (!raw || typeof raw !== "object") return null;
  let pct = Number(raw.utilization);
  if (!Number.isFinite(pct)) return null;
  const resetsAt = raw.resets_at ? Date.parse(raw.resets_at) : NaN;
  return {
    percent: Math.max(0, Math.min(100, Math.round(pct))),
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  };
}

function normalize({ org, usage }) {
  const extras = [];
  for (const [key, label] of [
    ["seven_day_opus", "Weekly (Opus)"],
    ["seven_day_sonnet", "Weekly (Sonnet)"],
  ]) {
    const w = toWindow(usage[key]);
    if (w && (w.percent > 0 || w.resetsAt)) extras.push({ label, ...w });
  }
  return {
    orgName: org?.name || "",
    session: toWindow(usage.five_hour),
    weekly: toWindow(usage.seven_day),
    extras,
  };
}

export async function fetchUsage() {
  let raw = null;
  let firstError = null;
  try {
    raw = await fetchDirect();
  } catch (e) {
    firstError = e;
  }
  if (!raw) {
    try {
      raw = await fetchViaTab();
    } catch (e) {
      firstError = e;
    }
  }
  if (!raw) {
    throw firstError instanceof ClaudeUsageError
      ? firstError
      : new ClaudeUsageError("unavailable", firstError?.message || "Could not read usage");
  }
  const usage = normalize(raw);
  if (!usage.session && !usage.weekly) {
    throw new ClaudeUsageError("unavailable", "Usage is not available for this account");
  }
  await writeCache(usage);
  return usage;
}

/* ---------------- Formatting ---------------- */

// Short form for the meter, for example "in 2h 10m · 3:40 PM" or "in 3d 4h · Sat 9:00 AM".
export function formatResetShort(ts, now = Date.now()) {
  if (!ts) return "reset time unknown";
  const mins = Math.max(0, Math.round((ts - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const span = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  const sameDay = new Date(ts).toDateString() === new Date(now).toDateString();
  const at = new Date(ts).toLocaleString([], sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `in ${span} · ${at}`;
}

export function formatReset(ts, now = Date.now()) {
  if (!ts) return "reset time unknown";
  const mins = Math.max(0, Math.round((ts - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const span = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  const at = new Date(ts).toLocaleString([], d ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" });
  return `resets in ${span} (${at})`;
}
