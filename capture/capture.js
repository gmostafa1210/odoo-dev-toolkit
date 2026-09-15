import { getCapture } from "../lib/db.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const msg = $("#msg");
const board = $("#board");
const overlay = $("#overlay");

const id = new URLSearchParams(location.search).get("id");
const record = id ? await getCapture(id) : null;

if (!record) {
  msg.textContent = "This screenshot is no longer stored. Only the latest capture is kept, so take a new one.";
} else {
  await startEditor(record);
}

async function startEditor(record) {
  const img = await createImageBitmap(record.blob);
  const ctx = board.getContext("2d");
  const octx = overlay.getContext("2d");
  board.width = img.width;
  board.height = img.height;
  ctx.drawImage(img, 0, 0);
  board.hidden = false;
  msg.remove();

  // Sizes are in image pixels, scaled so annotations look similar on retina captures.
  const unit = Math.max(1, img.width / 1600);

  const stamp = new Date(record.created);
  const pad = (n) => String(n).padStart(2, "0");
  const fileBase = `screenshot_${record.host}_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}`;
  document.title = `Screenshot of ${record.host}`;
  $("#title").textContent = record.host;
  $("#meta").textContent = `${img.width} x ${img.height} px, ${stamp.toLocaleString()}`;
  $$(".actions button").forEach((b) => (b.disabled = false));

  /* ---------------- State ---------------- */

  const state = { tool: "arrow", color: "#e03131", size: 3 };
  const shapes = [];
  const redoStack = [];
  let current = null;
  let dirty = false;
  let lastTool = state.tool;

  // Visible region of the original image (changes when cropping).
  const cropOf = () => {
    for (let i = shapes.length - 1; i >= 0; i--) if (shapes[i].tool === "crop") return shapes[i].rect;
    return { x: 0, y: 0, w: img.width, h: img.height };
  };

  /* ---------------- Toolbar ---------------- */

  function setTool(tool) {
    if (tool !== "crop") lastTool = tool;
    state.tool = tool;
    $$("#tools button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    board.classList.toggle("text-mode", tool === "text");
  }
  function setColor(color, fromCustom = false) {
    state.color = color;
    $$(".swatch").forEach((b) => b.setAttribute("aria-pressed", String(!fromCustom && b.dataset.color === color)));
    $(".custom").classList.toggle("active", fromCustom);
  }
  $$("#tools button").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $$(".swatch").forEach((b) => b.addEventListener("click", () => setColor(b.dataset.color)));
  $("#customColor").addEventListener("input", (e) => setColor(e.target.value, true));
  $("#size").addEventListener("input", (e) => (state.size = Number(e.target.value)));
  setTool(state.tool);
  setColor(state.color);

  function syncButtons() {
    $("#undo").disabled = !shapes.length;
    $("#redo").disabled = !redoStack.length;
    $("#clear").disabled = !shapes.length;
  }
  $("#undo").addEventListener("click", undo);
  $("#redo").addEventListener("click", redo);
  $("#clear").addEventListener("click", () => {
    if (!shapes.length) return;
    redoStack.length = 0;
    shapes.length = 0;
    redrawAll();
    window.scrollTo({ top: 0 });
  });

  /* ---------------- Drawing ---------------- */

  function drawShape(c, s) {
    const pts = s.points;
    const a = pts[0];
    const b = pts[pts.length - 1];
    c.save();
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.width;
    c.lineCap = "round";
    c.lineJoin = "round";

    switch (s.tool) {
      case "highlight":
        c.globalAlpha = 0.35;
        c.globalCompositeOperation = "multiply";
      // falls through
      case "pen": {
        c.beginPath();
        c.moveTo(a.x, a.y);
        if (pts.length === 1) c.lineTo(a.x + 0.01, a.y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.stroke();
        break;
      }
      case "line":
      case "arrow": {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = Math.max(14 * unit, s.width * 4);
        const end = s.tool === "arrow"
          ? { x: b.x - Math.cos(ang) * head * 0.6, y: b.y - Math.sin(ang) * head * 0.6 }
          : b;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(end.x, end.y);
        c.stroke();
        if (s.tool === "arrow") {
          c.beginPath();
          c.moveTo(b.x, b.y);
          c.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
          c.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
          c.closePath();
          c.fill();
        }
        break;
      }
      case "rect":
        c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        break;
      case "redact":
        c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        break;
      case "ellipse":
        c.beginPath();
        c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        c.stroke();
        break;
      case "crop": {
        const v = cropOf();
        const px = view().scale; // one screen pixel in image pixels
        const [x, y, w, h] = normRect(a, b);
        c.fillStyle = "rgba(0,0,0,.5)";
        c.beginPath();
        c.rect(v.x, v.y, v.w, v.h);
        c.rect(x, y, w, h);
        c.fill("evenodd");
        c.setLineDash([6 * px, 4 * px]);
        c.lineWidth = 1.5 * px;
        c.strokeStyle = "#fff";
        c.strokeRect(x, y, w, h);
        c.setLineDash([]);
        c.font = `600 ${13 * px}px system-ui, sans-serif`;
        c.fillStyle = "#fff";
        c.textBaseline = "bottom";
        c.fillText(`${Math.round(w)} x ${Math.round(h)}`, x + 4 * px, y > v.y + 20 * px ? y - 4 * px : y + h - 4 * px);
        break;
      }
      case "text": {
        c.font = `600 ${s.fontSize}px system-ui, sans-serif`;
        c.textBaseline = "top";
        c.lineWidth = Math.max(2, s.fontSize / 6);
        c.strokeStyle = s.color.toLowerCase() === "#ffffff" ? "#000" : "#fff";
        s.text.split("\n").forEach((line, i) => {
          const y = a.y + i * s.fontSize * 1.2;
          c.strokeText(line, a.x, y);
          c.fillText(line, a.x, y);
        });
        break;
      }
    }
    c.restore();
  }

  function normRect(a, b) {
    return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
  }

  function redrawAll() {
    const v = cropOf();
    board.width = Math.round(v.w); // resizing also resets the context
    board.height = Math.round(v.h);
    ctx.setTransform(1, 0, 0, 1, -v.x, -v.y);
    ctx.drawImage(img, 0, 0);
    shapes.forEach((s) => s.tool !== "crop" && drawShape(ctx, s));
    const cropped = v.w !== img.width || v.h !== img.height;
    $("#meta").textContent = `${board.width} x ${board.height} px${cropped ? " (cropped)" : ""}, ${stamp.toLocaleString()}`;
    dirty = shapes.length > 0;
    syncButtons();
  }

  function commit(shape) {
    shapes.push(shape);
    redoStack.length = 0;
    if (shape.tool === "crop") {
      redrawAll();
      setTool(lastTool);
      window.scrollTo({ top: 0 });
      return;
    }
    drawShape(ctx, shape);
    dirty = true;
    syncButtons();
  }

  function undo() {
    if (!shapes.length) return;
    redoStack.push(shapes.pop());
    redrawAll();
  }
  function redo() {
    if (!redoStack.length) return;
    const s = redoStack.pop();
    shapes.push(s);
    if (s.tool === "crop") return redrawAll();
    drawShape(ctx, s);
    dirty = true;
    syncButtons();
  }

  /* ---------------- Coordinates and preview ---------------- */

  const view = () => {
    const r = board.getBoundingClientRect();
    return { r, scale: board.width / r.width };
  };
  const toImage = (e) => {
    const { r, scale } = view();
    const v = cropOf();
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    return {
      x: clamp((e.clientX - r.left) * scale + v.x, v.x, v.x + v.w),
      y: clamp((e.clientY - r.top) * scale + v.y, v.y, v.y + v.h),
    };
  };

  function sizeOverlay() {
    const dpr = devicePixelRatio;
    overlay.width = Math.round(innerWidth * dpr);
    overlay.height = Math.round(innerHeight * dpr);
  }
  sizeOverlay();
  addEventListener("resize", sizeOverlay);

  let frame = 0;
  function preview() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (!current) return;
      const { r, scale } = view();
      const dpr = devicePixelRatio;
      // Map image coordinates to screen pixels, clipped to the board.
      octx.save();
      octx.beginPath();
      octx.rect(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
      octx.clip();
      const v = cropOf();
      octx.setTransform(dpr / scale, 0, 0, dpr / scale, (r.left - v.x / scale) * dpr, (r.top - v.y / scale) * dpr);
      drawShape(octx, current);
      octx.restore();
    });
  }

  function snap(a, p, tool) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    if (tool === "rect" || tool === "ellipse" || tool === "redact" || tool === "crop") {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: a.x + Math.sign(dx || 1) * d, y: a.y + Math.sign(dy || 1) * d };
    }
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
  }

  /* ---------------- Pointer input ---------------- */

  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = toImage(e);
    if (state.tool === "text") {
      e.preventDefault();
      openTextInput(p, e);
      return;
    }
    board.setPointerCapture(e.pointerId);
    const base = state.size * 2 * unit;
    current = {
      tool: state.tool,
      color: state.color,
      width: state.tool === "highlight" ? base * 5 : base,
      points: [p],
    };
    preview();
  });

  board.addEventListener("pointermove", (e) => {
    if (!current) return;
    if (current.tool === "pen" || current.tool === "highlight") {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) current.points.push(toImage(ev));
    } else {
      const start = current.points[0];
      const p = toImage(e);
      current.points = [start, e.shiftKey ? snap(start, p, current.tool) : p];
    }
    preview();
  });

  const finish = () => {
    if (!current) return;
    const s = current;
    current = null;
    preview();
    const [a, b] = [s.points[0], s.points[s.points.length - 1]];
    const tiny = Math.abs(b.x - a.x) < 3 && Math.abs(b.y - a.y) < 3;
    if (tiny && s.tool !== "pen" && s.tool !== "highlight") return;
    if (s.tool === "crop") {
      const [x, y, w, h] = normRect(a, b).map(Math.round);
      if (w < 10 || h < 10) return;
      commit({ tool: "crop", rect: { x, y, w, h }, points: [] });
      return;
    }
    commit(s);
  };
  board.addEventListener("pointerup", finish);
  board.addEventListener("pointercancel", finish);

  /* ---------------- Text tool ---------------- */

  let textBox = null;

  function openTextInput(p, e) {
    if (textBox) textBox.commit();
    const { scale } = view();
    const fontSize = (10 + state.size * 4) * unit;
    const color = state.color;
    const box = document.createElement("textarea");
    box.className = "text-input";
    box.rows = 1;
    Object.assign(box.style, {
      left: `${e.pageX}px`,
      top: `${e.pageY}px`,
      fontSize: `${fontSize / scale}px`,
      color,
    });
    document.body.appendChild(box);

    const autosize = () => {
      box.style.height = "auto";
      box.style.width = "auto";
      box.style.height = `${box.scrollHeight}px`;
      box.style.width = `${Math.max(80, box.scrollWidth + 8)}px`;
    };
    let done = false;
    const close = (save) => {
      if (done) return;
      done = true;
      const text = box.value.replace(/\s+$/, "");
      box.remove();
      textBox = null;
      if (save && text) commit({ tool: "text", color, text, fontSize, width: 0, points: [p] });
    };
    box.addEventListener("input", autosize);
    box.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        close(true);
      } else if (ev.key === "Escape") {
        close(false);
      }
    });
    box.addEventListener("blur", () => close(true));
    textBox = { commit: () => close(true) };
    autosize();
    setTimeout(() => box.focus(), 0);
  }

  /* ---------------- Keyboard ---------------- */

  const KEYS = { c: "crop", p: "pen", h: "highlight", l: "line", a: "arrow", r: "rect", e: "ellipse", t: "text", x: "redact" };
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === "s") { e.preventDefault(); $("#png").click(); }
    else if (mod && k === "c") { e.preventDefault(); $("#copy").click(); }
    else if (!mod && k === "escape" && current) { current = null; preview(); }
    else if (!mod && !e.altKey && KEYS[k]) setTool(KEYS[k]);
  });

  /* ---------------- Export ---------------- */

  const toBlob = (type, quality) => {
    if (type === "image/png") return new Promise((res) => board.toBlob(res, type));
    const c = document.createElement("canvas");
    c.width = board.width;
    c.height = board.height;
    const cc = c.getContext("2d");
    cc.fillStyle = "#fff";
    cc.fillRect(0, 0, c.width, c.height);
    cc.drawImage(board, 0, 0);
    return new Promise((res) => c.toBlob(res, type, quality));
  };

  const download = async (type, ext, quality) => {
    const blob = await toBlob(type, quality);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    dirty = false;
  };

  $("#png").onclick = () => download("image/png", "png");
  $("#jpg").onclick = () => download("image/jpeg", "jpg", 0.92);
  $("#pdf").onclick = () => {
    document.title = fileBase; // default PDF file name
    window.print();
    dirty = false;
  };
  $("#copy").onclick = async () => {
    const btn = $("#copy");
    try {
      const blob = await toBlob("image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      btn.textContent = "Copied";
      dirty = false;
    } catch {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = "Copy image"), 1500);
  };

  addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  syncButtons();
}
