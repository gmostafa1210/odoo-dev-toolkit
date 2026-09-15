import { saveCapture } from "./lib/db.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BRAND = "#714B67";
const MAX_CANVAS = 32000; // Chrome canvas dimension limit is 32767

/* ------------------------------------------------------------------ */
/* Messages from popup                                                 */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture") {
    sendResponse({ ok: true });
    capture(msg.tab, msg.full !== false);
  }
  if (msg?.type === "recorder:open") {
    sendResponse({ ok: true });
    openRecorder(msg.tab);
  }
});

/* ------------------------------------------------------------------ */
/* Keyboard shortcuts                                                  */
/* ------------------------------------------------------------------ */

let pendingDebug = null;

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  if (command === "full-page-capture") {
    capture(tab, true);
    return;
  }
  if (command === "toggle-recording") {
    toggleRecording(tab);
    return;
  }
  if (command === "toggle-debug") {
    // Single press: debug=1. Two presses within 350 ms: debug=assets.
    if (pendingDebug) {
      clearTimeout(pendingDebug);
      pendingDebug = null;
      toggleDebug(tab.id, true);
    } else {
      pendingDebug = setTimeout(() => {
        pendingDebug = null;
        toggleDebug(tab.id, false);
      }, 350);
    }
  }
});

async function toggleDebug(tabId, assets) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [assets],
      func: (assets) => {
        if (!window.odoo) return;
        const cur = window.odoo.debug || "";
        const next = assets
          ? cur.includes("assets") ? "0" : "assets"
          : cur ? "0" : "1";
        const url = new URL(location.href);
        url.searchParams.set("debug", next);
        location.assign(url.toString());
      },
    });
  } catch (e) {
    console.warn("Debug toggle failed:", e.message);
  }
}

/* ------------------------------------------------------------------ */
/* Screen recording                                                    */
/* ------------------------------------------------------------------ */

const RECORDER_DEFAULTS = {
  videoSource: "tab",
  videoMic: true,
  videoAudio: true,
  videoCountdown: true,
  videoClicks: true,
};

async function getRecording() {
  const { recording } = await chrome.storage.session.get("recording");
  if (!recording?.windowId) return null;
  try {
    await chrome.windows.get(recording.windowId);
    return recording;
  } catch {
    await chrome.storage.session.remove("recording");
    return null;
  }
}

async function openRecorder(tab) {
  const existing = await getRecording();
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  const s = await chrome.storage.local.get(RECORDER_DEFAULTS);
  const params = new URLSearchParams({
    tabId: String(tab.id),
    source: s.videoSource,
    mic: s.videoMic ? "1" : "0",
    audio: s.videoAudio ? "1" : "0",
    countdown: s.videoCountdown ? "1" : "0",
    clicks: s.videoClicks ? "1" : "0",
  });
  const size = { width: 340, height: 380 };
  let pos = {};
  try {
    const w = await chrome.windows.get(tab.windowId);
    pos = { left: Math.max(0, w.left + w.width - size.width - 24), top: w.top + 96 };
  } catch {}
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`recorder/recorder.html?${params}`),
    type: "popup",
    focused: true,
    ...size,
    ...pos,
  });
  await chrome.storage.session.set({ recording: { windowId: win.id, state: "ready" } });
}

async function toggleRecording(tab) {
  const rec = await getRecording();
  if (!rec) return openRecorder(tab);
  if (rec.state === "recording" || rec.state === "paused" || rec.state === "countdown") {
    chrome.runtime.sendMessage({ type: "recorder:stop" }).catch(() => {});
  } else {
    chrome.windows.update(rec.windowId, { focused: true });
  }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { recording } = await chrome.storage.session.get("recording");
  if (recording?.windowId === windowId) {
    if (recording.overlayTabId != null) {
      chrome.scripting
        .executeScript({
          target: { tabId: recording.overlayTabId },
          func: () => window.__otkClicks?.remove(),
        })
        .catch(() => {});
    }
    await chrome.storage.session.remove("recording");
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }
});

/* ------------------------------------------------------------------ */
/* Full page capture                                                   */
/* ------------------------------------------------------------------ */

function badge(tabId, text, color = BRAND) {
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
}

let busy = false;

async function capture(tab, full) {
  if (busy) return;
  busy = true;
  const tabId = tab.id;
  const windowId = tab.windowId;
  const run = async (func, args = []) =>
    (await chrome.scripting.executeScript({ target: { tabId }, func, args }))[0]?.result;
  let prepared = false;

  try {
    if (!full) {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      const blob = await (await fetch(dataUrl)).blob();
      const host = await run(() => location.hostname).catch(() => "page");
      await openResult(blob, host);
      return;
    }

    const info = await run(preparePage);
    prepared = true;
    const shots = [];
    const total = info.positions.length;

    for (let i = 0; i < total; i++) {
      badge(tabId, `${Math.round((i / total) * 100)}%`);
      const y = await run(scrollToPos, [info.positions[i], i]);
      // captureVisibleTab is limited to 2 calls per second.
      await sleep(i === 0 ? 150 : 550);
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      shots.push({ y, dataUrl });
    }

    await run(restorePage);
    prepared = false;
    badge(tabId, "...");
    const blob = await stitch(info, shots);
    await openResult(blob, info.host);
    badge(tabId, "");
  } catch (e) {
    console.error("Capture failed:", e);
    badge(tabId, "ERR", "#C0392B");
    setTimeout(() => badge(tabId, ""), 3000);
  } finally {
    if (prepared) await run(restorePage).catch(() => {});
    busy = false;
  }
}

async function openResult(blob, host) {
  const id = String(Date.now());
  await saveCapture(id, { blob, host: host || "page", created: Date.now() });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`capture/capture.html?id=${id}`) });
}

async function toBitmap(dataUrl) {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

async function stitch(info, shots) {
  const first = await toBitmap(shots[0].dataUrl);
  const scale = first.width / info.vw; // device pixel ratio as actually captured
  const W = first.width;
  const H = Math.round((info.vh + info.maxScroll) * scale);
  const k = Math.min(1, MAX_CANVAS / H); // downscale very long pages

  const canvas = new OffscreenCanvas(Math.round(W * k), Math.round(H * k));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.scale(k, k);

  const top = info.top * scale;
  const bottom = info.bottom * scale;
  const vh = Math.min(first.height, info.vh * scale);
  const regionH = bottom - top;

  for (let i = 0; i < shots.length; i++) {
    const img = i === 0 ? first : await toBitmap(shots[i].dataUrl);
    const y = shots[i].y * scale;
    if (i === 0) {
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, 0, top, W, regionH, 0, top + y, W, regionH);
    }
    // Area below an inner scroll container (footer etc.) comes from the last frame.
    if (i === shots.length - 1 && bottom < vh) {
      ctx.drawImage(img, 0, bottom, W, vh - bottom, 0, bottom + y, W, vh - bottom);
    }
    img.close();
  }
  return canvas.convertToBlob({ type: "image/png" });
}

/* ---- Functions below are injected into the page (isolated world) ---- */

function preparePage() {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const doc = document.scrollingElement || document.documentElement;

  const style = document.createElement("style");
  style.textContent =
    "*{scroll-behavior:auto!important;scrollbar-width:none!important}" +
    "::-webkit-scrollbar{display:none!important}";
  document.documentElement.appendChild(style);

  // Odoo scrolls inside .o_content / .o_action_manager, not the window.
  let scroller = null;
  if (doc.scrollHeight - vh > 2) {
    scroller = doc;
  } else {
    let best = 2;
    for (const el of document.querySelectorAll("body *")) {
      const extra = el.scrollHeight - el.clientHeight;
      if (extra <= best || el.clientHeight < 100) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "overlay") {
        best = extra;
        scroller = el;
      }
    }
  }

  let top = 0;
  let bottom = vh;
  if (scroller && scroller !== doc) {
    const r = scroller.getBoundingClientRect();
    top = Math.max(0, Math.round(r.top));
    bottom = Math.min(vh, Math.round(r.top + scroller.clientHeight));
  }
  const maxScroll = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
  const step = Math.max(1, Math.floor(bottom - top));
  const positions = [];
  for (let y = 0; y < maxScroll; y += step) positions.push(y);
  positions.push(maxScroll);

  window.__otkCapture = {
    scroller,
    style,
    orig: scroller ? scroller.scrollTop : 0,
    hidden: [],
  };
  return { vw, vh, top, bottom, maxScroll, positions, host: location.hostname };
}

function scrollToPos(y, index) {
  const s = window.__otkCapture;
  if (s.scroller) s.scroller.scrollTop = y;
  if (index === 1) {
    // Hide fixed/sticky elements after the first frame so they are not repeated.
    for (const el of document.querySelectorAll("body *")) {
      const p = getComputedStyle(el).position;
      if (p === "fixed" || p === "sticky") {
        s.hidden.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
        el.style.setProperty("visibility", "hidden", "important");
      }
    }
  }
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve(s.scroller ? s.scroller.scrollTop : 0))
    )
  );
}

function restorePage() {
  const s = window.__otkCapture;
  if (!s) return;
  for (const [el, value, priority] of s.hidden) {
    el.style.removeProperty("visibility");
    if (value) el.style.setProperty("visibility", value, priority);
  }
  s.style.remove();
  if (s.scroller) s.scroller.scrollTop = s.orig;
  delete window.__otkCapture;
}
