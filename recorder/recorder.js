import { clearRecordings, putChunk, finishRecording } from "../lib/db.js";
import { installClickOverlay, removeClickOverlay } from "./click-overlay.js";

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const opts = {
  tabId: Number(params.get("tabId")),
  source: params.get("source") === "screen" ? "screen" : "tab",
  mic: params.get("mic") === "1",
  audio: params.get("audio") === "1",
  countdown: params.get("countdown") === "1",
  clicks: params.get("clicks") !== "0",
};

let state = "ready"; // ready | countdown | recording | paused | saving | error
let windowId = null;
let host = opts.source === "screen" ? "screen" : "tab";
let captured = null; // video (+ tab/system audio)
let micStream = null;
let ctx = null;
let micGain = null;
let analyser = null;
let mixed = null;
let recorder = null;
let mime = "";
let recId = "";
let seq = 0;
let writes = Promise.resolve();
let elapsed = 0;
let resumedAt = 0;
let ticker = 0;
let discarding = false;
let overlayTabId = null;

/* ---------------- UI helpers ---------------- */

function show(view) {
  document.querySelectorAll("[data-view]").forEach((el) => (el.hidden = el.dataset.view !== view));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function badgeText(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return `${Math.min(999, Math.floor(s / 60))}m`;
}

function badge(text, color = "#d92d20") {
  chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
  chrome.action.setBadgeText({ text }).catch(() => {});
}

const currentElapsed = () => elapsed + (state === "recording" ? Date.now() - resumedAt : 0);

async function setState(next) {
  state = next;
  await chrome.storage.session.set({
    recording: { windowId, state, elapsed, resumedAt, source: opts.source, overlayTabId },
  });
}

/* ---------------- Ready screen ---------------- */

async function init() {
  windowId = (await chrome.windows.getCurrent()).id;

  const audioName = opts.source === "tab" ? "Tab audio" : "System or tab audio";
  const line = (el, on, text) => {
    el.textContent = `${on ? "✓" : "✕"} ${text}`;
    el.classList.toggle("off", !on);
  };
  line($("#sumAudio"), opts.audio, `${audioName} ${opts.audio ? "on" : "off"}`);
  line($("#sumMic"), opts.mic, `Microphone ${opts.mic ? "on" : "off"}`);
  line($("#sumCountdown"), opts.countdown, `3 second countdown ${opts.countdown ? "on" : "off"}`);
  line($("#sumCursor"), opts.clicks, `Click highlights ${opts.clicks ? "on" : "off"}`);

  if (opts.source === "tab") {
    try {
      const tab = await chrome.tabs.get(opts.tabId);
      $("#readyTitle").textContent = "Record this tab";
      $("#readyTarget").textContent = tab.title || tab.url || "Current tab";
      $("#readyTarget").title = tab.url || "";
      if (tab.url) host = new URL(tab.url).hostname || "tab";
    } catch {
      return fail("The tab to record is no longer open.");
    }
  } else {
    $("#readyTitle").textContent = "Record screen or window";
    $("#readyTarget").textContent = "Chrome will ask what to share after you click Start.";
    if (opts.audio) {
      $("#readyNote").textContent = "To include sound, tick “Share audio” in Chrome's picker.";
    }
    $("#start").textContent = "Choose and start";
  }
  show("ready");
  $("#start").focus();
}

/* ---------------- Capture ---------------- */

function even(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

function tabStreamId(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else if (!id) reject(new Error("Chrome did not allow capturing this tab."));
      else resolve(id);
    });
  });
}

async function captureTab() {
  const tab = await chrome.tabs.get(opts.tabId);
  const id = await tabStreamId(opts.tabId);
  const dpr = window.devicePixelRatio || 1;
  const w = even(Math.min(3840, (tab.width || 1280) * dpr));
  const h = even(Math.min(2160, (tab.height || 720) * dpr));
  const source = { chromeMediaSource: "tab", chromeMediaSourceId: id };
  return navigator.mediaDevices.getUserMedia({
    audio: opts.audio ? { mandatory: source } : false,
    video: {
      mandatory: { ...source, minWidth: w, maxWidth: w, minHeight: h, maxHeight: h, maxFrameRate: 30 },
    },
  });
}

function captureScreen() {
  const constraints = {
    video: { frameRate: 30, cursor: "always" },
    audio: opts.audio,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
  };
  if (opts.audio) constraints.systemAudio = "include";
  return navigator.mediaDevices.getDisplayMedia(constraints);
}

async function captureMic() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    $("#recNote").textContent = "Microphone is blocked or unavailable, so it is not recorded. Allow it with the camera icon in this window's address area or in Chrome site settings.";
    $("#recNote").classList.add("warn");
    return null;
  }
}

function buildMix() {
  const tracks = [...captured.getVideoTracks()];
  const sourceAudio = captured.getAudioTracks();

  if (sourceAudio.length || micStream) {
    const dest = ctx.createMediaStreamDestination();
    if (sourceAudio.length) {
      const src = ctx.createMediaStreamSource(new MediaStream(sourceAudio));
      src.connect(dest);
      // Tab capture mutes the tab for the user, so play it back locally.
      if (opts.source === "tab") src.connect(ctx.destination);
    }
    if (micStream) {
      const src = ctx.createMediaStreamSource(micStream);
      micGain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(micGain);
      micGain.connect(dest);
      src.connect(analyser);
    }
    tracks.push(...dest.stream.getAudioTracks());
  }
  mixed = new MediaStream(tracks);

  captured.getVideoTracks()[0].addEventListener("ended", () => stop());
}

function pickMime() {
  const types = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/* ---------------- Pointer overlay ---------------- */

// Click highlights are drawn inside the recorded page. No pointer is drawn.
async function addOverlay(tabId) {
  if (!opts.clicks) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: installClickOverlay,
    });
    overlayTabId = tabId;
  } catch (e) {
    $("#recNote").textContent = "Click highlights cannot be shown on this page.";
    $("#recNote").classList.add("warn");
  }
}

function dropOverlay() {
  if (overlayTabId == null) return;
  const tabId = overlayTabId;
  overlayTabId = null;
  chrome.scripting.executeScript({ target: { tabId }, func: removeClickOverlay }).catch(() => {});
}

async function focusRecordedTab() {
  try {
    const tab = await chrome.tabs.get(opts.tabId);
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // Tab closed or not accessible: recording continues without focusing.
  }
}

/* ---------------- Recording ---------------- */

async function start() {
  $("#start").disabled = true;
  $("#readyNote").textContent = "";
  // Create the audio context during the click so autoplay rules allow it.
  ctx = new AudioContext();
  ctx.resume().catch(() => {});

  try {
    captured = opts.source === "tab" ? await captureTab() : await captureScreen();
  } catch (e) {
    await ctx.close().catch(() => {});
    ctx = null;
    $("#start").disabled = false;
    if (e.name === "NotAllowedError" && opts.source === "screen") {
      $("#readyNote").textContent = "Sharing was cancelled. Click to try again.";
      return;
    }
    const hint = opts.source === "tab"
      ? " This page may not allow capture (chrome:// pages, Web Store). Try “Screen or window” mode, or reopen the recorder from the extension icon on the tab."
      : "";
    return fail(`${e.message || e.name}.${hint}`);
  }

  if (opts.source === "screen") {
    const label = captured.getVideoTracks()[0]?.label || "";
    if (label) $("#readyTarget").textContent = label;
    if (opts.audio && !captured.getAudioTracks().length) {
      $("#recNote").textContent = "No system audio was shared. Tick “Share audio” in the picker next time.";
      $("#recNote").classList.add("warn");
    }
  }

  if (opts.mic) micStream = await captureMic();
  buildMix();

  const surface = captured.getVideoTracks()[0]?.getSettings?.().displaySurface;
  // Click highlights only make sense when a browser tab is recorded.
  if (opts.source === "tab" || surface === "browser") {
    await addOverlay(opts.tabId);
    // Chrome only draws the real pointer in a tab capture once the tab's window
    // receives mouse events. Bring it to the front now, so the pointer shows
    // from the first second instead of after the first click.
    await focusRecordedTab();
  }

  if (opts.countdown) {
    show("countdown");
    await setState("countdown");
    for (let n = 3; n > 0; n--) {
      $("#count").textContent = n;
      badge(String(n), "#714B67");
      await new Promise((r) => setTimeout(r, 1000));
      if (state !== "countdown") return; // cancelled
    }
  }
  await begin();
}

async function begin(retryWithWebm = false) {
  mime = retryWithWebm ? "video/webm" : pickMime();
  recId = String(Date.now());
  seq = 0;
  writes = clearRecordings();

  try {
    recorder = new MediaRecorder(mixed, {
      mimeType: mime,
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 128_000,
    });
  } catch (e) {
    if (!retryWithWebm) return begin(true);
    return fail(`Recording is not supported: ${e.message}`);
  }
  mime = recorder.mimeType || mime;

  recorder.ondataavailable = (e) => {
    if (!e.data || !e.data.size || discarding) return;
    const n = seq++;
    writes = writes.then(() => putChunk(recId, n, e.data));
  };
  recorder.onerror = (e) => {
    if (seq === 0 && !retryWithWebm && mime.startsWith("video/mp4")) {
      recorder.onstop = null;
      try { recorder.stop(); } catch {}
      begin(true);
      return;
    }
    $("#recNote").textContent = `Recorder error: ${e.error?.message || "unknown"}. Saving what was recorded.`;
    stop();
  };
  recorder.onstop = finalize;

  recorder.start(1000);
  elapsed = 0;
  resumedAt = Date.now();
  await setState("recording");
  show("recording");

  $("#mute").hidden = !micStream;
  $("#meterWrap").hidden = !micStream;
  clearInterval(ticker);
  ticker = setInterval(updateTimer, 500);
  updateTimer();
  if (analyser) requestAnimationFrame(drawMeter);
}

function updateTimer() {
  const ms = currentElapsed();
  $("#timer").textContent = fmt(ms);
  if (state === "recording") badge(badgeText(ms));
}

function drawMeter() {
  if (!analyser || (state !== "recording" && state !== "paused")) return;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
  const muted = micGain && micGain.gain.value === 0;
  $("#meter").style.width = `${muted ? 0 : Math.min(100, (peak / 128) * 160)}%`;
  requestAnimationFrame(drawMeter);
}

async function togglePause() {
  if (state === "recording") {
    recorder.pause();
    elapsed += Date.now() - resumedAt;
    await setState("paused");
    $("#pause").textContent = "Resume";
    $("#stateLabel").textContent = "Paused";
    $("#dot").classList.add("paused");
    badge("II", "#6b6f7b");
  } else if (state === "paused") {
    recorder.resume();
    resumedAt = Date.now();
    await setState("recording");
    $("#pause").textContent = "Pause";
    $("#stateLabel").textContent = "Recording";
    $("#dot").classList.remove("paused");
  }
  updateTimer();
}

function toggleMute() {
  if (!micGain) return;
  const mute = micGain.gain.value !== 0;
  micGain.gain.value = mute ? 0 : 1;
  $("#mute").setAttribute("aria-pressed", String(mute));
  $("#mute").textContent = mute ? "Unmute mic" : "Mute mic";
}

async function stop() {
  if (state === "countdown") {
    await setState("ready");
    cleanup();
    return window.close();
  }
  if (state !== "recording" && state !== "paused") return;
  if (state === "recording") elapsed += Date.now() - resumedAt;
  await setState("saving");
  show("saving");
  clearInterval(ticker);
  badge("…", "#714B67");
  if (recorder.state !== "inactive") recorder.stop();
  else finalize();
}

async function discard() {
  const btn = $("#discard");
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = "Click again to discard";
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = "Discard";
    }, 3000);
    return;
  }
  discarding = true;
  await stop();
}

function cleanup() {
  clearInterval(ticker);
  dropOverlay();
  for (const s of [captured, micStream, mixed]) s?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  ctx = null;
}

async function normalWindowId() {
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
  return (wins.find((w) => w.focused) || wins[0])?.id;
}

async function finalize() {
  cleanup();
  try {
    await writes;
    if (discarding) {
      await clearRecordings();
    } else {
      await finishRecording(recId, {
        mime,
        host,
        source: opts.source,
        created: Number(recId),
        duration: elapsed,
        chunks: seq,
      });
      const url = chrome.runtime.getURL(`recorder/result.html?id=${recId}`);
      const target = await normalWindowId();
      if (target) {
        await chrome.tabs.create({ windowId: target, url });
        await chrome.windows.update(target, { focused: true });
      } else {
        await chrome.windows.create({ url });
      }
    }
  } catch (e) {
    badge("ERR");
    return fail(`Saving failed: ${e.message}`);
  }
  badge("");
  await chrome.storage.session.remove("recording");
  state = "done";
  window.close();
}

function fail(message) {
  cleanup();
  state = "error";
  badge("");
  chrome.storage.session.set({ recording: { windowId, state: "error" } });
  $("#errorText").textContent = message;
  show("error");
}

/* ---------------- Wiring ---------------- */

$("#start").addEventListener("click", start);
$("#cancel").addEventListener("click", () => window.close());
$("#pause").addEventListener("click", togglePause);
$("#mute").addEventListener("click", toggleMute);
$("#stop").addEventListener("click", stop);
$("#discard").addEventListener("click", discard);
$("#errorClose").addEventListener("click", () => window.close());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "recorder:stop") stop();
  if (msg?.type === "recorder:pause") togglePause();
});

addEventListener("pagehide", dropOverlay);

addEventListener("beforeunload", (e) => {
  if (state === "recording" || state === "paused" || state === "saving") e.preventDefault();
});

init();
