import {
  hasPermission, requestPermission, removePermission, fetchUsage, readCache, clearCache, formatReset, formatResetShort,
} from "../lib/claude-usage.js";

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

function openTab(name) {
  $$("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
  save({ lastTab: name });
}
$$("nav button").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
openTab(settings.lastTab);

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

if (!isOdoo) {
  $("#status").textContent = "Not an Odoo page. Screenshots and video still work.";
} else {
  const d = info.debug;
  const current = !d ? "0" : d.includes("assets") ? "assets" : "1";
  const version = info.version ? `Odoo ${info.version}` : "Odoo";
  $("#status").textContent = `${version}, debug ${d || "off"}`;
  $$(".mode").forEach((b) => b.classList.toggle("current", b.dataset.mode === current));
}

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

/* ---------------- Record info ---------------- */

const list = $("#infoList");
const rows = isOdoo
  ? [
      ["Model", info.model],
      ["Record ID", info.recordId],
      ["View", info.viewType],
      ["Action", info.action],
      ["Database", info.database],
      ["Version", info.version],
      ["Debug", info.debug || "off"],
    ]
  : [["Status", "Not an Odoo page"]];

for (const [label, value] of rows) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value || "-";
  if (value) {
    dd.title = "Copy";
    dd.addEventListener("click", async () => {
      await navigator.clipboard.writeText(value);
      dd.classList.add("copied");
      setTimeout(() => dd.classList.remove("copied"), 800);
    });
  }
  list.append(dt, dd);
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
