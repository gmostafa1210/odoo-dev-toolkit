# Odoo Dev Toolkit (Chrome MV3)

One extension combining:

| Feature | Where |
|---|---|
| Debug toggle (off / debug / assets) | Popup > Debug, `Ctrl+.` (press twice for assets) |
| Barcode scan simulator: Scan, or Scan and add to a saved list (max 6) with per-item Scan and Remove. O-CMD / O-BTN aware delays | Popup > Barcode |
| Full page and visible area screenshots with crop and annotation (pencil, highlight, line, arrow, box, circle, text, hide data), PNG, JPEG, PDF, clipboard export | Popup > Screenshot, `Alt+Shift+P` |
| Screen recording (this tab, window or screen) with tab/system audio, microphone, click highlights, pause, mute, MP4 (tab) / WebM (screen) download | Popup > Video, `Alt+Shift+R` |
| OWL component inspector (tree, props, state, highlight, $owl) | DevTools > "Odoo OWL" tab |
| Current model / record ID / action / version | Popup > Info |
| Claude session and weekly usage (when signed in to claude.ai) | Popup header, right side |

## Install locally
1. `chrome://extensions` > enable Developer mode.
2. Load unpacked > select this folder.
3. Change shortcuts at `chrome://extensions/shortcuts`.

## Notes
- Barcodes are sent through Odoo's `barcode` service bus when available, otherwise as fast keydown events.
- Screenshots detect Odoo's inner scroll container (`.o_content`) automatically. Pages taller than 32000 device pixels are downscaled. Horizontal scrolling is not stitched.
- Only the latest screenshot is kept (IndexedDB).
- The OWL panel is a lightweight inspector. For the profiler, event log and reactivity tracking, use Odoo's official Owl devtools.
