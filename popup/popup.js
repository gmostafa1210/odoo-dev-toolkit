import {
  hasPermission, requestPermission, removePermission, fetchUsage, readCache, clearCache, formatReset, formatResetShort,
} from "../lib/claude-usage.js";
import { collectSiteInfo, CATEGORY_ORDER, reportText } from "./site-info.js";
import { initDevTools } from "./dev-tools.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

async function inPage(func, args = []) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func,
      args,
    });
    return res?.result;
  } catch {
    return undefined; // chrome:// pages, Web Store, etc.
  }
}

/* ---------------- Settings ---------------- */

const settings = await chrome.storage.local.get({
  lastTab: "debug",
  claudeUsage: true,
  delay: 500,
  cmdDelay: 1000,
  closeAfter: true,
  codes: "",
  quickBarcodes: [],
  videoSource: "tab",
  videoMic: true,
  videoAudio: true,
  videoCountdown: true,
  videoClicks: true,
});
const save = (patch) => chrome.storage.local.set(patch);

/* ---------------- Tabs ---------------- */

function openTab(name, remember = true) {
  $$("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
  if (remember) save({ lastTab: name });
}
$$("nav button").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));

$("#shortcuts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

/* ---------------- Page detection ---------------- */

const info = await inPage(() => {
  const o = window.odoo;
  if (!o) return null;
  const env = o.__WOWL_DEBUG__?.root?.env;
  const ctrl = env?.services?.action?.currentController;
  const s = (v) => (v === undefined || v === null || v === false ? "" : String(v));
  return {
    debug: s(o.debug),
    version: s(o.info?.server_version),
    database: s(o.info?.db),
    model: s(ctrl?.props?.resModel || ctrl?.action?.res_model),
    recordId: s(ctrl?.props?.resId),
    viewType: s(ctrl?.props?.type || ctrl?.view?.type),
    action: s(ctrl?.action?.xml_id || ctrl?.action?.id),
    url: location.href,
  };
});

const isOdoo = Boolean(info);
$$(".odoo-only").forEach((el) => (el.disabled = !isOdoo));

// Debug and Barcode only make sense on Odoo pages.
const ODOO_TABS = ["debug", "barcode"];
if (!isOdoo) {
  for (const name of ODOO_TABS) {
    $(`nav button[data-tab="${name}"]`).hidden = true;
    $(`#${name}`).hidden = true;
  }
}
if (!isOdoo && ODOO_TABS.includes(settings.lastTab)) {
  openTab("info", false); // keep the saved tab for the next Odoo page
} else {
  openTab(settings.lastTab);
}

if (!isOdoo) {
  $("#status").textContent = "Not an Odoo page. Screenshots and video still work.";
} else {
  const d = info.debug;
  const current = !d ? "0" : d.includes("assets") ? "assets" : "1";
  const version = info.version ? `Odoo ${info.version}` : "Odoo";
  $("#status").textContent = `${version}, debug ${d || "off"}`;
  $$(".mode").forEach((b) => b.classList.toggle("current", b.dataset.mode === current));
}

initDevTools({ tab, inPage, isOdoo, info });

/* ---------------- Debug ---------------- */

$$(".mode").forEach((btn) =>
  btn.addEventListener("click", async () => {
    await inPage(
      (mode) => {
        const url = new URL(location.href);
        url.searchParams.set("debug", mode);
        location.assign(url.toString());
      },
      [btn.dataset.mode]
    );
    window.close();
  })
);

/* ---------------- Barcode ---------------- */

const MAX_SAVED = 6;
const codesEl = $("#codes");
const msgEl = $("#barcodeMsg");
const listEl = $("#lists");
let saved = settings.quickBarcodes.slice(0, MAX_SAVED);

codesEl.value = settings.codes;
$("#delay").value = settings.delay;
$("#cmdDelay").value = settings.cmdDelay;
$("#closeAfter").checked = settings.closeAfter;
codesEl.addEventListener("input", () => save({ codes: codesEl.value }));

const parseCodes = (raw) => raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const note = (text, isError = false) => {
  msgEl.textContent = text;
  msgEl.classList.toggle("error", isError);
};

function renderSaved() {
  $("#listCount").textContent = `${saved.length} / ${MAX_SAVED}`;
  listEl.replaceChildren();
  if (!saved.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing saved yet. Use Scan and add to keep a barcode here.";
    listEl.append(li);
    return;
  }
  for (const item of saved) {
    const codes = parseCodes(item.codes);
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "record";
    info.title = codes.join("\n");
    const main = document.createElement("div");
    main.className = "record-code";
    main.textContent = codes[0];
    info.append(main);
    if (codes.length > 1) {
      const more = document.createElement("span");
      more.textContent = `+${codes.length - 1} more: ${codes.slice(1).join(", ")}`;
      info.append(more);
    }

    const scan = document.createElement("button");
    scan.className = "small primary";
    scan.textContent = "Scan";
    scan.disabled = !isOdoo;
    scan.addEventListener("click", () => sendCodes(codes));

    const remove = document.createElement("button");
    remove.className = "small";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      saved = saved.filter((x) => x.id !== item.id);
      save({ quickBarcodes: saved });
      renderSaved();
      note(`Removed ${codes[0]}.`);
    });

    li.append(info, scan, remove);
    listEl.append(li);
  }
}

// Returns false when the entry could not be added.
function addToSaved(codes) {
  const key = codes.join("\n");
  if (saved.some((x) => x.codes === key)) return true; // already there, just scan
  if (saved.length >= MAX_SAVED) {
    note(`The list is full (${MAX_SAVED}). Remove one before adding another.`, true);
    return false;
  }
  saved.unshift({ id: crypto.randomUUID(), codes: key, added: Date.now() });
  save({ quickBarcodes: saved });
  renderSaved();
  return true;
}

// Injected into the page. Starts scanning and returns immediately,
// so the popup can close without cancelling the run.
function scanBarcodes(codes, delay, cmdDelay) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const service = window.odoo?.__WOWL_DEBUG__?.root?.env?.services?.barcode;
  const viaService = Boolean(service?.bus);

  const scan = (barcode) => {
    const target = document.activeElement || document.body;
    if (viaService) {
      service.bus.trigger("barcode_scanned", { barcode, target });
      return;
    }
    // Fallback: emulate a keyboard-wedge scanner (fast keystrokes + Enter).
    const fire = (key) =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    for (const ch of barcode) fire(ch);
    fire("Enter");
  };

  (async () => {
    for (let i = 0; i < codes.length; i++) {
      if (i > 0) await sleep(/^O-(CMD|BTN)\./.test(codes[i]) ? cmdDelay : delay);
      scan(codes[i]);
    }
  })();
  return { viaService, count: codes.length };
}

async function sendCodes(codes) {
  const delay = Math.max(0, Number($("#delay").value) || 0);
  const cmdDelay = Math.max(0, Number($("#cmdDelay").value) || 0);
  const closeAfter = $("#closeAfter").checked;
  await save({ delay, cmdDelay, closeAfter });

  const res = await inPage(scanBarcodes, [codes, delay, cmdDelay]);
  if (!res) return note("Could not reach the page. Reload it and try again.", true);
  if (closeAfter) return window.close();
  note(`Scanning ${res.count} barcode(s) via ${res.viaService ? "barcode service" : "keyboard events"}.`);
}

function readInput() {
  const codes = parseCodes(codesEl.value);
  if (!codes.length) note("Enter a barcode first.", true);
  return codes;
}

$("#scan").addEventListener("click", () => {
  const codes = readInput();
  if (codes.length) sendCodes(codes);
});

$("#scanAdd").addEventListener("click", () => {
  const codes = readInput();
  if (codes.length && addToSaved(codes)) sendCodes(codes);
});

renderSaved();

/* ---------------- Screenshot ---------------- */

async function requestCapture(full) {
  await chrome.runtime.sendMessage({ type: "capture", full, tab: { id: tab.id, windowId: tab.windowId } });
  window.close();
}
$("#shotFull").addEventListener("click", () => requestCapture(true));
$("#shotVisible").addEventListener("click", () => requestCapture(false));

/* ---------------- Video recording ---------------- */

let videoSource = settings.videoSource;
$("#vMic").checked = settings.videoMic;
$("#vAudio").checked = settings.videoAudio;
$("#vCountdown").checked = settings.videoCountdown;
$("#vClicks").checked = settings.videoClicks;

function setSource(source) {
  videoSource = source;
  $$(".seg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.source === source)));
  $("#vAudioLabel").textContent = source === "tab" ? "Tab audio" : "System or tab audio (Chrome asks)";
  save({ videoSource: source });
}
$$(".seg button").forEach((b) => b.addEventListener("click", () => setSource(b.dataset.source)));
setSource(videoSource);

for (const [id, key] of [
  ["#vMic", "videoMic"],
  ["#vAudio", "videoAudio"],
  ["#vCountdown", "videoCountdown"],
  ["#vClicks", "videoClicks"],
]) {
  $(id).addEventListener("change", (e) => save({ [key]: e.target.checked }));
}

$("#recStart").addEventListener("click", async () => {
  await save({
    videoSource,
    videoMic: $("#vMic").checked,
    videoAudio: $("#vAudio").checked,
    videoCountdown: $("#vCountdown").checked,
    videoClicks: $("#vClicks").checked,
  });
  await chrome.runtime.sendMessage({ type: "recorder:open", tab: { id: tab.id, windowId: tab.windowId } });
  window.close();
});

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

async function refreshVideo() {
  const { recording } = await chrome.storage.session.get("recording");
  let active = recording && ["recording", "paused", "countdown", "ready", "saving"].includes(recording.state);
  if (active) {
    try {
      await chrome.windows.get(recording.windowId);
    } catch {
      active = false;
    }
  }
  $("#videoIdle").hidden = Boolean(active);
  $("#videoActive").hidden = !active;
  if (!active) return;

  const labels = { recording: "Recording", paused: "Paused", countdown: "Starting…", ready: "Recorder open, not started", saving: "Saving…" };
  $("#recStatus").textContent = labels[recording.state];
  $("#recDot").className = `rec-dot ${recording.state === "recording" ? "live" : "paused"}`;
  const ms = (recording.elapsed || 0) + (recording.state === "recording" ? Date.now() - recording.resumedAt : 0);
  $("#recTime").textContent = ["recording", "paused"].includes(recording.state) ? fmtTime(ms) : "";
  $("#recStop").disabled = !["recording", "paused", "countdown"].includes(recording.state);

  $("#recShow").onclick = () => {
    chrome.windows.update(recording.windowId, { focused: true });
    window.close();
  };
  $("#recStop").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "recorder:stop" }).catch(() => {});
    window.close();
  };
}
refreshVideo();
setInterval(refreshVideo, 1000);

/* ---------------- Info tab ---------------- */

const list = $("#infoList");

function copyable(dd, value) {
  if (!value) return;
  dd.title = "Copy";
  dd.addEventListener("click", async () => {
    await navigator.clipboard.writeText(value);
    dd.classList.add("copied");
    setTimeout(() => dd.classList.remove("copied"), 800);
  });
}

function addRows(target, rows) {
  for (const [label, value, display] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = display ?? (value || "-");
    if (/^(Missing|No, )/.test(dd.textContent)) dd.classList.add("warn");
    copyable(dd, value);
    target.append(dt, dd);
  }
}

if (isOdoo) {
  addRows(list, [
    ["Model", info.model],
    ["Record ID", info.recordId],
    ["View", info.viewType],
    ["Action", info.action],
    ["Database", info.database],
    ["Version", info.version],
    ["Debug", info.debug || "off"],
  ]);
} else {
  addRows(list, [["Status", "", "Not an Odoo page"]]);
  loadSiteInfo();
}

function section(title, extra) {
  const wrap = document.createElement("section");
  wrap.className = "site-section";
  const head = document.createElement("h3");
  head.textContent = title;
  if (extra) head.append(extra);
  wrap.append(head);
  $("#siteInfo").append(wrap);
  return wrap;
}

function dl(parent, rows) {
  const d = document.createElement("dl");
  addRows(d, rows);
  parent.append(d);
}

const yesNo = (v, yes = "Yes", no = "No") => (v ? yes : no);

async function loadSiteInfo() {
  const box = $("#siteInfo");
  box.hidden = false;
  box.textContent = "Inspecting this website…";
  const site = await inPage(collectSiteInfo);
  box.textContent = "";

  if (!site) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "This page cannot be inspected. Browser pages (chrome://), the Chrome Web Store and PDF viewers are blocked by Chrome.";
    box.append(p);
    return;
  }

  // Website
  const web = section("Website");
  dl(web, [
    ["Host", site.host],
    ["Title", site.title],
    ["HTTPS", "", site.https ? "Yes" : "No, connection is not encrypted"],
    ["Language", site.lang],
    ["Charset", site.charset],
    ...(site.generator ? [["Generator", site.generator]] : []),
  ]);

  // Technologies, grouped by category
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = String(site.tech.length);
  const techSec = section("Technologies", count);
  if (!site.tech.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No known technologies detected.";
    techSec.append(p);
  } else {
    const groups = new Map();
    for (const t of site.tech) {
      if (!groups.has(t.category)) groups.set(t.category, []);
      groups.get(t.category).push(t);
    }
    const order = [...groups.keys()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a) + 99) % 99 - (CATEGORY_ORDER.indexOf(b) + 99) % 99
    );
    for (const cat of order) {
      const row = document.createElement("div");
      row.className = "tech-row";
      const label = document.createElement("span");
      label.className = "tech-cat";
      label.textContent = cat;
      const chips = document.createElement("div");
      chips.className = "chips";
      for (const t of groups.get(cat)) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = t.name;
        if (t.version) {
          const v = document.createElement("small");
          v.textContent = t.version;
          chip.append(v);
        }
        chips.append(chip);
      }
      row.append(label, chips);
      techSec.append(row);
    }
  }

  // Performance
  const perf = section("Performance");
  const kb = site.transferKb >= 1024 ? `${(site.transferKb / 1024).toFixed(1)} MB` : `${site.transferKb} KB`;
  dl(perf, [
    ["Page load", "", site.loadMs != null ? `${(site.loadMs / 1000).toFixed(2)} s` : "Still loading"],
    ["DOM ready", "", site.domReadyMs != null ? `${(site.domReadyMs / 1000).toFixed(2)} s` : "-"],
    ["Requests", "", String(site.requests)],
    ["Transferred", "", `${kb}${site.transferKb === 0 ? " (cached)" : ""}`],
    ["DOM nodes", "", site.domNodes.toLocaleString()],
  ]);

  // SEO
  const seo = section("SEO");
  const titleLen = site.title.length;
  dl(seo, [
    ["Title length", "", `${titleLen} characters${titleLen > 60 ? " (long)" : titleLen && titleLen < 30 ? " (short)" : ""}`],
    ["Description", site.description, site.description || "Missing"],
    ["Canonical", site.canonical, site.canonical || "Missing"],
    ["Robots", site.robots, site.robots || "Not set (indexable)"],
    ["H1 headings", "", String(site.h1)],
    ["Open Graph", site.ogTitle, site.ogTitle ? `${site.ogTitle}${site.ogImage ? " + image" : ""}` : "Missing"],
    ["Mobile viewport", "", yesNo(site.viewport)],
    ["Favicon", "", yesNo(site.favicon)],
  ]);

  // Server and security
  const sec = section("Server and security");
  const h = site.headers;
  if (site.headersUnavailable) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Response headers are not available for this page.";
    sec.append(p);
  } else {
    dl(sec, [
      ["Server", h.server, h.server || "Hidden"],
      ["Powered by", h["x-powered-by"], h["x-powered-by"] || "Hidden"],
      ["HSTS", h["strict-transport-security"], yesNo(h["strict-transport-security"], "Enabled", "Missing")],
      ["CSP", h["content-security-policy"], yesNo(h["content-security-policy"], "Enabled", "Missing")],
      ["Frame options", h["x-frame-options"], h["x-frame-options"] || "Missing"],
      ["No-sniff", h["x-content-type-options"], h["x-content-type-options"] || "Missing"],
      ["Referrer policy", h["referrer-policy"], h["referrer-policy"] || "Not set"],
    ]);
  }

  // Copy full report
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-report";
  btn.textContent = "Copy website report";
  btn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(reportText(site));
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy website report"), 1200);
  });
  box.append(btn);
}

/* ---------------- Claude Usage meter ---------------- */

const USAGE_URL = "https://claude.ai/settings/usage";
const claudeEl = $("#claude");
const claudeToggle = $("#claudeToggle");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function openUrl(url) {
  chrome.tabs.create({ url });
  window.close();
}

function meterRow(label, w) {
  const wrap = el("div", "cu-item");
  const row = el("div", "cu-row");
  wrap.append(row);
  if (!w) {
    row.append(el("span", "", label), el("div", "cu-bar"), el("span", "cu-pct", "-"));
    return wrap;
  }
  row.classList.toggle("warn", w.percent >= 50 && w.percent < 80);
  row.classList.toggle("high", w.percent >= 80);
  const bar = el("div", "cu-bar");
  const fill = el("i");
  fill.style.width = `${w.percent}%`;
  bar.append(fill);
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${label} ${w.percent}% used`);
  row.append(el("span", "", label), bar, el("span", "cu-pct", `${w.percent}%`));
  const reset = el("div", "cu-reset", `↻ ${formatResetShort(w.resetsAt)}`);
  reset.dataset.resetsAt = w.resetsAt || "";
  wrap.append(reset);
  return wrap;
}

// Keep the countdowns current while the popup stays open.
setInterval(() => {
  document.querySelectorAll(".cu-reset[data-resets-at]").forEach((r) => {
    const ts = Number(r.dataset.resetsAt);
    if (ts) r.textContent = `↻ ${formatResetShort(ts)}`;
  });
}, 30000);

function renderUsage(usage, { stale = false, at = Date.now() } = {}) {
  const box = el("a", "cu-box");
  box.href = USAGE_URL;
  box.addEventListener("click", (e) => {
    e.preventDefault();
    openUrl(USAGE_URL);
  });
  const title = el("div", "cu-title");
  title.append(el("span", "", "Claude Usage"), el("span", "", stale ? "…" : ""));
  box.append(title, meterRow("Session", usage.session), meterRow("Weekly", usage.weekly));
  if (stale) box.classList.add("cu-stale");

  const lines = [];
  if (usage.orgName) lines.push(usage.orgName);
  if (usage.session) lines.push(`Session (5 hours): ${usage.session.percent}% used, ${formatReset(usage.session.resetsAt)}`);
  if (usage.weekly) lines.push(`Weekly: ${usage.weekly.percent}% used, ${formatReset(usage.weekly.resetsAt)}`);
  for (const x of usage.extras || []) lines.push(`${x.label}: ${x.percent}% used, ${formatReset(x.resetsAt)}`);
  lines.push(`Updated ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Click to open claude.ai usage.`);
  box.title = lines.join("\n");
  claudeEl.replaceChildren(box);
}

function renderNote(text, title, onClick) {
  const btn = el("button", "cu-note", text);
  btn.type = "button";
  if (title) btn.title = title;
  btn.addEventListener("click", onClick);
  claudeEl.replaceChildren(btn);
}

async function loadUsage() {
  const cache = await readCache();
  if (cache?.usage) renderUsage(cache.usage, { stale: true, at: cache.at });
  else claudeEl.replaceChildren(el("div", "cu-note", "Claude Usage…"));

  try {
    const usage = await fetchUsage();
    renderUsage(usage);
  } catch (e) {
    if (e.code === "signed_out") {
      renderNote("Claude: sign in", "Sign in to claude.ai in this browser to see your usage", () => openUrl("https://claude.ai/login"));
    } else if (cache?.usage) {
      renderUsage(cache.usage, { stale: true, at: cache.at });
      claudeEl.firstChild.title += `\n\nCould not refresh: ${e.message}`;
    } else {
      renderNote("Claude Usage n/a", `${e.message}. Click to open claude.ai usage.`, () => openUrl(USAGE_URL));
    }
  }
}

async function setupClaude() {
  const enabled = settings.claudeUsage;
  claudeToggle.textContent = enabled ? "Hide Claude Usage" : "Show Claude Usage";
  claudeEl.hidden = !enabled;
  if (!enabled) return;

  if (!(await hasPermission())) {
    renderNote("Show Claude Usage", "Allow reading your usage from claude.ai (needs you to be signed in)", async () => {
      // Chrome may close the popup while asking; usage shows next time it opens.
      const granted = await requestPermission().catch(() => false);
      if (granted) loadUsage();
    });
    return;
  }
  loadUsage();
}

claudeToggle.addEventListener("click", async (e) => {
  e.preventDefault();
  settings.claudeUsage = !settings.claudeUsage;
  await save({ claudeUsage: settings.claudeUsage });
  if (!settings.claudeUsage) {
    await clearCache();
    await removePermission().catch(() => {});
  }
  setupClaude();
});

setupClaude();
