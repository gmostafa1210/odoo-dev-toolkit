import { getRecording } from "../lib/db.js";

const $ = (sel) => document.querySelector(sel);
const id = new URLSearchParams(location.search).get("id");
const { meta, chunks } = id ? await getRecording(id) : { meta: null, chunks: [] };

const pad = (n) => String(n).padStart(2, "0");
const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

if (!meta || !chunks.length) {
  $("#msg").textContent = "This recording is no longer stored. Only the latest recording is kept.";
} else {
  const type = meta.mime.split(";")[0] || "video/webm";
  const ext = type === "video/mp4" ? "mp4" : "webm";
  const blob = new Blob(chunks, { type });
  const url = URL.createObjectURL(blob);
  const d = new Date(meta.created);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const fileName = `recording_${meta.host}_${stamp}.${ext}`;

  document.title = `Recording of ${meta.host}`;
  $("#title").textContent = meta.source === "tab" ? `Tab recording: ${meta.host}` : "Screen recording";
  $("#meta").textContent = `${fmt(meta.duration)}, ${(blob.size / 1048576).toFixed(1)} MB, ${ext.toUpperCase()}, ${d.toLocaleString()}`;

  const player = $("#player");
  player.src = url;
  player.hidden = false;
  $("#msg").remove();

  // MediaRecorder WebM files have no duration header. Seeking far ahead
  // makes the browser compute it so the preview timeline works.
  player.addEventListener("loadedmetadata", () => {
    if (player.duration !== Infinity) return;
    const fix = () => {
      player.removeEventListener("timeupdate", fix);
      player.currentTime = 0;
    };
    player.addEventListener("timeupdate", fix);
    player.currentTime = 1e9;
  });

  $("#download").disabled = false;
  $("#download").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      $("#download").click();
    }
  });
}
