# Odoo Dev Toolkit

**Version:** 1.4.6
**Type:** Chrome extension (Manifest V3)
**Works with:** Odoo 16, 17, 18, 19 (backend web client)

One extension for everyday Odoo development: debug mode switching, barcode scan simulation, full page screenshots with crop and annotation, screen recording with audio, current record info, and an OWL component inspector inside DevTools.

> **About screenshot placeholders**
> Every `[SCREENSHOT]` block below marks a place to add an image. Save your images in a `screenshots/` folder next to this file using the suggested file name, and the image links will work automatically. A full checklist is in [Appendix C](#appendix-c-screenshot-checklist).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Keyboard Shortcut Setup](#4-keyboard-shortcut-setup)
5. [The Popup at a Glance](#5-the-popup-at-a-glance)
6. [Debug Mode](#6-debug-mode)
7. [Barcode Scanner Simulator](#7-barcode-scanner-simulator)
8. [Screenshots](#8-screenshots)
9. [Screenshot Editor: Crop and Annotate](#9-screenshot-editor-crop-and-annotate)
10. [Saving and Sharing Screenshots](#10-saving-and-sharing-screenshots)
11. [Screen Recording](#11-screen-recording)
12. [Info Tab (Record Details)](#12-info-tab-record-details)
13. [OWL Component Inspector (DevTools)](#13-owl-component-inspector-devtools)
14. [Updating the Extension](#14-updating-the-extension)
15. [Troubleshooting](#15-troubleshooting)
16. [Permissions and Privacy](#16-permissions-and-privacy)
17. [Known Limitations](#17-known-limitations)
18. [Publishing to the Chrome Web Store](#18-publishing-to-the-chrome-web-store)
- [Appendix A: Keyboard Shortcut Reference](#appendix-a-keyboard-shortcut-reference)
- [Appendix B: Project Structure](#appendix-b-project-structure)
- [Appendix C: Screenshot Checklist](#appendix-c-screenshot-checklist)

---

## 1. Overview

| Feature | What it does | Where |
|---|---|---|
| Debug mode | Switch between Off, Debug and Assets in one click | Popup > **Debug**, `Ctrl+.` |
| Barcode simulator | Send barcodes to Odoo as if scanned, keep up to 6 saved barcodes | Popup > **Barcode** |
| Screenshots | Capture the full page or the visible area | Popup > **Screenshot**, `Alt+Shift+P` |
| Screenshot editor | Crop, draw, highlight, add arrows, boxes, circles, text, hide data | Opens after each capture |
| Screen recording | Record a tab, window or the whole screen with tab/system audio and microphone | Popup > **Video**, `Alt+Shift+R` |
| Record info | Model, record ID, view, action, database, version | Popup > **Info** |
| OWL inspector | Component tree, props, state, highlight, console access | DevTools > **Odoo OWL** |

> **[SCREENSHOT]** Extension popup open on an Odoo page
> ![Popup overview](screenshots/01-overview.png)

---

## 2. Requirements

- **Browser:** Google Chrome 116 or newer. Microsoft Edge and Brave also work.
- **Odoo:** Any Odoo 16+ instance (local, staging or production) that you can open in the browser.
- **Screen recording:** Tab recordings are MP4 on Chrome 126 or newer (WebM on older versions). Screen and window recordings are always WebM. A microphone is optional.
- **Barcode feature:** Works best with the Odoo **Barcode** app (`stock_barcode`, Enterprise). Other scan-aware views also work.
- **No Chrome Web Store account** is needed for local use. The $5 developer fee only applies to publishing.

---

## 3. Installation

### Step 1: Get the files

1. Download `odoo-dev-toolkit.zip`.
2. Extract it to a permanent location, for example:
   - Linux: `~/tools/odoo-dev-toolkit`
   - Windows: `C:\tools\odoo-dev-toolkit`

> **Important:** Chrome loads the extension from this folder every time it starts. Do not delete or move the folder after installing, or the extension will stop working.

Check that the folder looks like this, with `manifest.json` directly inside:

```
odoo-dev-toolkit/
├── manifest.json
├── background.js
├── popup/
├── capture/
├── devtools/
├── lib/
└── icons/
```

> **[SCREENSHOT]** Extracted folder in the file manager
> ![Extracted folder](screenshots/02-extracted-folder.png)

### Step 2: Open the Extensions page

Type this in the address bar and press Enter:

```
chrome://extensions
```

(Edge: `edge://extensions`, Brave: `brave://extensions`)

### Step 3: Enable Developer mode

Turn on the **Developer mode** toggle in the top right corner.

> **[SCREENSHOT]** Developer mode toggle turned on
> ![Developer mode](screenshots/03-developer-mode.png)

### Step 4: Load the extension

1. Click **Load unpacked**.
2. Select the `odoo-dev-toolkit` folder (the folder itself, not the zip file and not a folder inside it).
3. Click **Select Folder**.

> **[SCREENSHOT]** Load unpacked button and folder picker
> ![Load unpacked](screenshots/04-load-unpacked.png)

### Step 5: Verify

An **Odoo Dev Toolkit** card should appear with version **1.3.0**.

- If an **Errors** button appears on the card, click it and see [Troubleshooting](#15-troubleshooting).

> **[SCREENSHOT]** Extension card on chrome://extensions
> ![Extension card](screenshots/05-extension-card.png)

### Step 6: Pin the icon

1. Click the **puzzle piece** icon in the Chrome toolbar.
2. Click the **pin** next to **Odoo Dev Toolkit**.

The purple icon now stays visible in the toolbar.

> **[SCREENSHOT]** Pinning the extension from the puzzle menu
> ![Pin extension](screenshots/06-pin-icon.png)

---

## 4. Keyboard Shortcut Setup

Default shortcuts:

| Action | Windows / Linux | macOS |
|---|---|---|
| Toggle debug mode | `Ctrl+.` | `Cmd+.` |
| Toggle assets mode | `Ctrl+.` twice quickly | `Cmd+.` twice quickly |
| Full page screenshot | `Alt+Shift+P` | `Option+Shift+P` |
| Start / stop screen recording | `Alt+Shift+R` | `Option+Shift+R` |

Chrome does not assign a shortcut if another extension already uses it. To check or change them:

1. Open `chrome://extensions/shortcuts`, or click **Change keyboard shortcuts** at the bottom of the popup.
2. Find **Odoo Dev Toolkit**.
3. Click the pencil icon next to an action and press your new key combination.
4. Optionally set the scope to **Global** if you want the shortcut to work when Chrome is not focused (not recommended for these actions).

> **[SCREENSHOT]** chrome://extensions/shortcuts with the toolkit's shortcuts
> ![Shortcut settings](screenshots/07-shortcuts.png)

---

## 5. The Popup at a Glance

Click the toolbar icon to open the popup.

| Area | Description |
|---|---|
| **Header** | Shows the detected Odoo version and current debug mode, for example `Odoo 18.0, debug off`. On non-Odoo pages it shows `Not an Odoo page. Screenshots still work.` |
| **Tabs** | Debug, Barcode, Screenshot, Video, Info. The popup remembers the last tab you used. |
| **Footer** | Link to keyboard shortcut settings. |

On non-Odoo pages, Odoo-only buttons (debug modes, barcode scanning) are disabled. Screenshots work on any normal web page.

> **[SCREENSHOT]** Popup header on an Odoo page vs a non-Odoo page
> ![Popup header states](screenshots/08-popup-header.png)

---

## 6. Debug Mode

### 6.1 Modes

| Button | URL parameter | What it does |
|---|---|---|
| **Off** | `debug=0` | Turns debug off and clears it from the session |
| **Debug** | `debug=1` | Developer tools: technical fields, View Fields, Edit View, metadata, bug icon menu |
| **Assets** | `debug=assets` | Debug plus unminified JS and CSS bundles, for readable stack traces and breakpoints |

The current mode is highlighted in teal.

> **[SCREENSHOT]** Debug tab with the current mode highlighted
> ![Debug tab](screenshots/09-debug-tab.png)

### 6.2 Switching with the popup

1. Open any Odoo backend page.
2. Open the popup and go to the **Debug** tab.
3. Click a mode. The page reloads with the new mode and the popup closes.

The rest of the URL (path, hash, record) is kept, so you stay on the same record.

### 6.3 Switching with the keyboard

| Keys | Result |
|---|---|
| `Ctrl+.` once | Debug off → `debug=1`. Any debug mode on → off. |
| `Ctrl+.` twice within 350 ms | Assets off → `debug=assets`. Assets on → off. |

> **[SCREENSHOT]** Odoo navbar with the bug icon after enabling debug
> ![Debug enabled](screenshots/10-debug-enabled.png)

---

## 7. Barcode Scanner Simulator

Send barcodes to Odoo without a physical scanner.

> **[SCREENSHOT]** Barcode tab with saved barcodes
> ![Barcode tab](screenshots/12-barcode-tab.png)

### 7.1 Tab layout

| Element | Purpose |
|---|---|
| **Text box** | One barcode, or several (one per line) scanned in order |
| **Scan** | Sends the text box contents to the page |
| **Scan and add** | Saves the text box contents to the list, then scans |
| **Saved barcodes** | Up to 6 saved items, each with **Scan** and **Remove** |
| **Delay between scans (ms)** | Wait time between barcodes in a multi-line entry. Default `500` |
| **Delay before O-CMD / O-BTN (ms)** | Longer wait before command barcodes. Default `1000` |
| **Close this popup after scanning** | Closes the popup after sending so you can watch the page. On by default |

### 7.2 Scan a barcode once

1. Open the Odoo page that should receive the scan (for example **Inventory > Barcode**).
2. Open the popup and go to the **Barcode** tab.
3. Type a barcode, for example `WH-RECEIPTS`.
4. Click **Scan**.

### 7.3 Save a barcode for reuse

1. Type the barcode (or several lines).
2. Click **Scan and add**.
3. It appears at the top of **Saved barcodes** and is scanned immediately.

List rules:

- **Maximum 6 items.** The counter shows usage, for example `5 / 6`.
- When the list is full, **Scan and add** shows *"The list is full (6). Remove one before adding another."* and does **not** scan. Remove an item first.
- Adding something that is already saved does not create a duplicate; it only scans.
- The list is stored in the browser and stays after restarting Chrome.

> **[SCREENSHOT]** "List is full" message
> ![List full](screenshots/13-barcode-list-full.png)

### 7.4 Use a saved barcode

- **Scan** sends that item to the current page.
- **Remove** deletes it from the list immediately.

Items with several barcodes show the first code and a line like `+2 more: PROD-001, O-BTN.validate`. Hover over the item to see all of them.

### 7.5 Scan sequences (multi-line)

Put each barcode on its own line to simulate a full workflow:

```
WH-RECEIPTS
PROD-001
PROD-001
LOC-01-02-00
O-BTN.validate
```

- Normal barcodes wait **Delay between scans** before being sent.
- Lines starting with `O-CMD.` or `O-BTN.` wait **Delay before O-CMD / O-BTN**, giving Odoo time to finish loading before the command runs.

Common Odoo command barcodes:

| Barcode | Action |
|---|---|
| `O-CMD.MAIN-MENU` | Back to the Barcode main menu |
| `O-BTN.validate` | Validate the current operation |
| `O-CMD.DISCARD` | Discard changes |
| `O-BTN.print-op` | Print the operation |

> Command barcodes vary by Odoo version. Print the **Barcode commands** sheet from the Barcode app settings to see the exact list for your version.

### 7.6 How the scan is delivered

After scanning with the popup kept open, the message shows which method was used:

| Message | Meaning |
|---|---|
| `via barcode service` | The barcode was sent through Odoo's `barcode` service bus (`barcode_scanned` event). This is the preferred path. |
| `via keyboard events` | The service was not found, so fast keystrokes plus Enter were sent, like a USB scanner. |

### 7.7 Testing on Community (no Barcode app)

Open the browser console on an Odoo page and run:

```javascript
odoo.__WOWL_DEBUG__.root.env.services.barcode.bus.addEventListener(
  "barcode_scanned", (e) => console.log("scanned:", e.detail.barcode)
);
```

Then scan from the popup. Each barcode is printed in the console.

> **[SCREENSHOT]** Console showing received barcodes
> ![Console barcode test](screenshots/14-barcode-console.png)

---

## 8. Screenshots

### 8.1 Capture types

| Option | Result |
|---|---|
| **Capture full page** | Scrolls through the page and stitches everything into one tall image |
| **Capture visible area** | Captures only what is currently on screen |

### 8.2 Take a full page screenshot

1. Open the page, for example a long list view.
2. Do one of these:
   - Popup > **Screenshot** > **Capture full page**
   - Press `Alt+Shift+P`
3. Keep the tab in front while capturing. The toolbar icon badge shows progress (`0%` … `100%`).
4. The screenshot opens in a new tab with the editor.

> **[SCREENSHOT]** Screenshot tab in the popup
> ![Screenshot tab](screenshots/15-screenshot-tab.png)

> **[SCREENSHOT]** Progress badge on the toolbar icon
> ![Capture progress](screenshots/16-capture-progress.png)

### 8.3 How full page capture works

- **Odoo scroll areas are detected automatically.** Odoo scrolls inside the content area, not the whole window. The extension finds the largest scrollable area and captures its full content, keeping the navbar and control panel once at the top.
- **Fixed and sticky elements** (headers, floating buttons) are hidden after the first frame so they are not repeated.
- **Scrollbars are hidden** during capture.
- The page is scrolled back to where it was when finished.
- Chrome allows about 2 captures per second, so long pages take a few seconds.

### 8.4 Tips

- Do not switch tabs or scroll while capturing.
- Close popups, tooltips and dropdowns first if you do not want them in the image.
- Very long pages (over 32000 device pixels tall) are scaled down to fit Chrome's canvas limit.

---

## 9. Screenshot Editor: Crop and Annotate

The capture tab is a full editor.

> **[SCREENSHOT]** Editor with toolbar and an annotated screenshot
> ![Editor overview](screenshots/17-editor-overview.png)

### 9.1 Toolbar

| Section | Contents |
|---|---|
| **Top row** | Page host, image size, capture time, export buttons |
| **Tools** | Crop, Pencil, Highlight, Line, Arrow, Box, Circle, Text, Hide |
| **Colors** | Red, orange, yellow, green, blue, Odoo purple, black, plus a custom color picker (rainbow circle) |
| **Size** | Slider for line thickness and text size |
| **History** | Undo, Redo, Reset |

### 9.2 Drawing tools

| Tool | Key | How to use | Shift modifier |
|---|---|---|---|
| **Pencil** | `P` | Drag to draw freehand | |
| **Highlight** | `H` | Drag over text like a marker pen (semi-transparent, wide) | |
| **Line** | `L` | Drag from start to end | Snaps to 45° angles |
| **Arrow** | `A` | Drag from tail to tip | Snaps to 45° angles |
| **Box** | `R` | Drag corner to corner | Perfect square |
| **Circle** | `E` | Drag corner to corner | Perfect circle |
| **Text** | `T` | Click, type, press Enter | |
| **Hide** | `X` | Drag to cover an area with a solid block | Perfect square |

General steps:

1. Choose a tool (click it or press its key).
2. Choose a color and size.
3. Drag on the image. A live preview follows the mouse.
4. Release to place it. Press `Esc` while dragging to cancel.

> **[SCREENSHOT]** Examples of each tool on one image
> ![Tool examples](screenshots/18-tool-examples.png)

### 9.3 Adding text

1. Select **Text** (`T`).
2. Click where the text should start.
3. Type your text.
   - `Enter` places the text.
   - `Shift+Enter` adds a new line.
   - `Esc` cancels.
   - Clicking elsewhere also places it.
4. Text gets a white outline so it stays readable on any background. Use the **Size** slider before clicking to change the font size.

> **[SCREENSHOT]** Text being typed on a screenshot
> ![Text tool](screenshots/19-text-tool.png)

### 9.4 Hiding sensitive data

Use **Hide** (`X`) to cover prices, emails, phone numbers, customer names or API keys.

1. Pick **black** (or a color matching the background).
2. Select **Hide**.
3. Drag over the data.

> **Security note:** Hidden areas are painted over in the exported image, so the original pixels are not recoverable from the file. Always check the exported image before sharing.

> **[SCREENSHOT]** Before and after hiding customer data
> ![Hide data](screenshots/20-hide-data.png)

### 9.5 Cropping

1. Select **Crop** (`C`).
2. Drag over the area to keep. Everything outside is dimmed and the size is shown (for example `555 x 290`).
   - Hold `Shift` for a square.
   - Press `Esc` while dragging to cancel.
3. Release the mouse. The crop is applied right away.
4. The editor switches back to the tool you used before cropping.

After cropping:

- The header shows the new size with `(cropped)`.
- You can crop again inside the cropped area.
- Existing annotations are kept; anything outside the crop is simply not shown.
- **Undo** restores the previous crop.
- All exports use the cropped image.

> **[SCREENSHOT]** Crop selection with dimmed outside area
> ![Crop selecting](screenshots/21-crop-select.png)

> **[SCREENSHOT]** Result after cropping
> ![Crop result](screenshots/22-crop-result.png)

### 9.6 Undo, Redo, Reset

| Button | Shortcut | Action |
|---|---|---|
| **Undo** | `Ctrl+Z` | Remove the last annotation or crop |
| **Redo** | `Ctrl+Y` or `Ctrl+Shift+Z` | Bring back what was undone |
| **Reset** | | Remove all annotations and crops, back to the original capture |

Drawing something new after undoing clears the redo history.

---

## 10. Saving and Sharing Screenshots

| Button | Shortcut | Result |
|---|---|---|
| **Download PNG** | `Ctrl+S` | Lossless image, best for UI screenshots |
| **Download JPEG** | | Smaller file, white background, 92% quality |
| **Save as PDF** | | Opens the print dialog. Choose **Save as PDF** as the destination. Long images are split across pages. |
| **Copy image** | `Ctrl+C` | Copies a PNG to the clipboard. Paste into Slack, email, docs or tickets. |

File names follow this pattern:

```
screenshot_<host>_<YYYY-MM-DD>_<HH-MM-SS>.png
```

Example: `screenshot_localhost_2026-09-15_14-30-05.png`

Good to know:

- All annotations and crops are included in every export.
- If you try to close the tab with changes that were not exported, Chrome asks for confirmation.
- **Only the latest capture is stored.** Taking a new screenshot replaces the previous one. Export anything you want to keep.

> **[SCREENSHOT]** Print dialog with Save as PDF
> ![Save as PDF](screenshots/23-save-pdf.png)

---

## 11. Screen Recording

Record Odoo workflows with sound, for tutorials, bug reports and client demos.

> **[SCREENSHOT]** Video tab in the popup
> ![Video tab](screenshots/29-video-tab.png)

### 11.1 What you can record

| Source | Video | Audio options | Picker |
|---|---|---|---|
| **This tab** | The current tab only, even if you switch to other tabs or windows | Tab audio, microphone | No picker, records the tab you opened the recorder from |
| **Screen or window** | A Chrome tab, any application window, or the entire screen | System or tab audio (see note), microphone | Chrome's share picker |

> **System audio support:** Chrome can share system audio from the whole screen on Windows and ChromeOS. On macOS and Linux, only tab audio can be shared in the picker. Use **This tab** mode when you need page sound on those systems.

### 11.2 Recording options

| Option | Description |
|---|---|
| **This tab / Screen or window** | What to record |
| **Tab audio** (or **System or tab audio**) | Include sound from the page or system |
| **Microphone (your voice)** | Mix your microphone into the recording |
| **Highlight clicks** | Shows a purple ring wherever you click, so viewers can follow your actions (see 11.9) |
| **3 second countdown** | Gives you time to get ready after clicking Start |

Options are remembered for next time.

### 11.3 Record a tab

1. Open the Odoo page you want to record.
2. Click the extension icon and go to the **Video** tab.
3. Select **This tab** and choose your audio options.
4. Click **Open recorder**. A small recorder window opens in the top right corner.
5. Check the summary (tab name and options), then click **Start recording** (or press `Enter`).
6. The first time you use the microphone, Chrome asks for permission in the recorder window. Click **Allow**.
7. The Odoo tab is brought to the front automatically and the countdown continues on the toolbar icon badge (`3`, `2`, `1`). The recording then starts. Do your workflow in the tab.
8. To reach the controls again, click the extension icon (**Video** tab), use `Alt+Shift+R` to stop, or switch to the recorder window from the taskbar.

> **[SCREENSHOT]** Recorder window ready to start
> ![Recorder ready](screenshots/30-recorder-ready.png)

Good to know:

- Chrome shows a capture indicator on the recorded tab.
- You still hear the tab's sound while it is being recorded.
- The recording follows that tab only. Switching to other tabs does not change what is recorded.
- Your real mouse pointer is recorded as is. The extension never adds a second pointer.
- Chrome only includes the pointer once the Odoo window receives mouse movement. Bringing the tab to the front before recording starts takes care of this, so the pointer is visible from the start.
- Click rings are drawn inside the page, so they appear in the video and briefly on your screen.

### 11.4 Record a screen or window

1. Open the **Video** tab, select **Screen or window**, and click **Open recorder**.
2. Click **Choose and start**. The recorder window expands to full screen so Chrome's picker has room, then the picker opens.
3. Choose **Chrome Tab**, **Window** or **Entire Screen**, then select the item.
4. To include sound, turn on **Share audio** (tab) or **Share system audio** (screen, Windows/ChromeOS).
5. Click **Share** (or **Share with Audio**). The recorder window shrinks back to its small size, the countdown starts, then recording begins. If you click **Cancel**, the window also returns to its small size.

> **[SCREENSHOT]** Chrome share picker with Share audio option
> ![Share picker](screenshots/31-share-picker.png)

> **Tip:** When recording the entire screen, minimize the recorder window so it is not in the video. Use the popup or `Alt+Shift+R` to stop.

> **[SCREENSHOT]** Click highlight in a recording
> ![Click highlight](screenshots/36-click-highlight.png)

### 11.5 While recording

The recorder window shows:

| Element | Description |
|---|---|
| **Red dot and timer** | Recording time, excluding pauses |
| **Mic level bar** | Live microphone level, so you can check your voice is picked up |
| **Pause / Resume** | Pause without ending the recording. Paused time is not included |
| **Mute mic / Unmute mic** | Silence the microphone temporarily |
| **Stop and save** | Finish and open the video |
| **Discard** | Throw away the recording. Click twice to confirm |

The toolbar icon also shows the time as a red badge (for example `2:15`), or `II` when paused.

> **[SCREENSHOT]** Recorder window while recording
> ![Recorder recording](screenshots/32-recorder-recording.png)

> **[SCREENSHOT]** Toolbar badge showing recording time
> ![Recording badge](screenshots/33-recording-badge.png)

### 11.6 Stopping a recording

Any of these stops and saves the recording:

- **Stop and save** in the recorder window.
- **Stop and save** in the popup's **Video** tab (it shows the live timer while recording).
- `Alt+Shift+R`.
- **Stop sharing** in Chrome's sharing bar (screen or window mode).
- Closing the recorded tab (tab mode).

Chrome asks for confirmation if you try to close the recorder window while recording. Closing it anyway loses the recording.

> **[SCREENSHOT]** Popup Video tab during recording
> ![Popup recording](screenshots/34-popup-recording.png)

### 11.7 Preview and download

After stopping, a new tab opens with the video.

1. Play it to check the result.
2. Click **Download** (or press `Ctrl+S`).

| Item | Details |
|---|---|
| **Format** | **This tab:** MP4 (H.264 + AAC) on Chrome 126+, otherwise WebM. **Screen or window:** always WebM (VP9/VP8 + Opus), because screen and window captures can change size while recording, which Chrome's MP4 recorder cannot handle |
| **Quality** | Up to the tab or screen resolution, 30 frames per second, about 5 Mbps |
| **Resolution** | Tab: the tab's size. Screen or window: up to 1920 x 1080 (larger screens are scaled down) |
| **File name** | `recording_<host>_<YYYY-MM-DD>_<HH-MM-SS>.mp4` or `.webm` |
| **Approximate size** | 30 to 40 MB per minute at 1080p |
| **Playing WebM** | Chrome, Firefox, VLC and YouTube all support WebM. To get MP4, convert with a tool such as `ffmpeg -i input.webm output.mp4` |

> **Important:** Only the **latest** recording is stored. Starting a new recording deletes the previous one, so download it first.

> **[SCREENSHOT]** Recording preview page
> ![Recording preview](screenshots/35-recording-preview.png)

### 11.8 Using recordings in documentation

Word and most documentation tools cannot play a local video file for every reader. Instead:

1. Upload the video to YouTube (unlisted is fine), Google Drive, or your own website.
2. In the document, add a screenshot of the video with a link to it, or a plain link.
3. In Word: select the image or text, press `Ctrl+K`, and paste the video URL.

### 11.9 Mouse pointer and click highlights

The video shows **only your real mouse pointer**, exactly as Chrome records it. The extension does not draw any extra pointer.

**Highlight clicks** adds a short purple ring where you click:

| Mode | Click highlights |
|---|---|
| **This tab** | Yes |
| **Screen or window**, sharing a Chrome tab | Yes, in the tab the recorder was opened from |
| **Screen or window**, sharing a window or the entire screen | No |

Good to know:

- Clicks inside embedded frames (for example the website editor or some mail previews) are not highlighted.
- A full page reload during recording (for example switching debug mode) stops click highlights for the rest of the recording, because Chrome ends the extension's page access on reload. Normal Odoo navigation between menus and records is not affected.
- The highlight overlay is removed automatically when recording stops.
- The recorded tab is brought to the front before the recording starts, so Chrome shows your pointer from the first second without a click.
- If your real pointer is still missing from a **This tab** recording on your Chrome version, move the mouse over the page once after the countdown, or use **Screen or window** mode and share the window instead.

### 11.10 Recording tips for Odoo tutorials

- Use a clean database with demo data and close unrelated tabs.
- Set the browser zoom so fields are readable (100% to 125%).
- Turn off debug mode unless the tutorial is about developer features.
- Test your microphone level with the level bar before the real take.
- Use **Pause** between steps instead of recording long waits.
- Hide sensitive data before recording, since videos cannot be edited in the extension.

## 12. Info Tab (Record Details)

The **Info** tab shows details about the current Odoo screen:

| Field | Example |
|---|---|
| **Model** | `sale.order` |
| **Record ID** | `42` |
| **View** | `form` |
| **Action** | `sale.action_orders` |
| **Database** | `odoo18_dev` |
| **Version** | `18.0` |
| **Debug** | `assets` or `off` |

**Click any value to copy it.** It turns teal briefly to confirm.

Common uses:

- Copy the model name for a domain, `ir.model.access` line or search.
- Copy the record ID for `env['sale.order'].browse(42)` in the Odoo shell.
- Copy the action XML ID for menus or `ir.actions` references.

Fields that do not apply (for example Record ID on a list view) show `-`.

> **[SCREENSHOT]** Info tab on a sales order form
> ![Info tab](screenshots/24-record-tab.png)

---

## 13. OWL Component Inspector (DevTools)

Inspect the live OWL component tree of the Odoo web client.

### 13.1 Open the panel

1. Open an Odoo backend page.
2. Press `F12` (or `Ctrl+Shift+I`).
3. Click the **Odoo OWL** tab. If you do not see it, check the `>>` overflow menu.
4. If the tab is missing right after installing, close DevTools and open it again.

> **[SCREENSHOT]** DevTools with the Odoo OWL tab
> ![OWL panel tab](screenshots/25-owl-tab.png)

### 13.2 Panel layout

| Area | Description |
|---|---|
| **Toolbar** | Refresh tree, filter box, "Highlight on hover" option, component count |
| **Left** | Component tree (for example `WebClient > ActionContainer > FormController > ...`) |
| **Right** | Details of the selected component |

### 13.3 Browse the tree

- Click **▸ / ▾** to expand or collapse a node. Nodes deeper than 4 levels start collapsed.
- **Hover** a node to highlight its element on the page with a purple box, its name and size.
- **Click** a node to show its details.
- Type in **Filter components** to find components by name. Matches are highlighted and their parents are expanded.

> **[SCREENSHOT]** Hovering a component highlights it on the page
> ![OWL highlight](screenshots/26-owl-highlight.png)

### 13.4 Component details

| Section | Content |
|---|---|
| **Name** | Component class name |
| **Status** | `new`, `mounted`, `cancelled` or `destroyed` |
| **Template** | OWL template name, for example `web.FormView` |
| **Props** | Props passed to the component, with value previews |
| **Instance fields and state** | Fields on the component, including `state` |
| **Env keys** | Keys available in `this.env` |

Action buttons:

| Button | Action |
|---|---|
| **Show in Elements** | Selects the component's first DOM element in the Elements panel |
| **Store as $owl in console** | Saves the component as `$owl` in the page console |
| **Highlight** | Highlights the element on the page |

> **[SCREENSHOT]** Details panel for a selected component
> ![OWL details](screenshots/27-owl-details.png)

### 13.5 Working with `$owl` in the console

After clicking **Store as $owl in console**, open the **Console** tab:

```javascript
$owl                      // the component instance
$owl.props                // live props
$owl.state                // reactive state
$owl.props.record?.data   // field values on form/list records
$owl.env.services.orm     // services from env
```

### 13.6 After navigation

The tree refreshes automatically about 1.5 seconds after a full page load. After in-app navigation (opening another menu or record), click **Refresh tree**.

---

## 14. Updating the Extension

1. Download the new version.
2. Replace the contents of your existing `odoo-dev-toolkit` folder with the new files (keep the same folder path).
3. Open `chrome://extensions`.
4. Click the **reload** icon (circular arrow) on the Odoo Dev Toolkit card.
5. Refresh any open Odoo tabs.
6. Close and reopen DevTools if you use the OWL panel.

Settings, saved barcodes, delays and video options are kept after updating, because they are stored in the browser, not in the folder.

> **[SCREENSHOT]** Reload button on the extension card
> ![Reload extension](screenshots/28-reload.png)

### For developers modifying the code

| You changed | Do this |
|---|---|
| `manifest.json`, `background.js` | Reload the extension |
| `popup/*` | Close and reopen the popup |
| `capture/*` | Take a new screenshot, or refresh the capture tab |
| `devtools/*` | Reload the extension, then close and reopen DevTools |
| `recorder/*` | Close the recorder window and open it again |

Debugging:

- **Service worker** (shortcuts, capture): click **service worker** on the extension card.
- **Popup:** right-click inside the popup > **Inspect**.
- **OWL panel:** right-click inside the panel > **Inspect** (DevTools for DevTools).

---

## 15. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Manifest file is missing or unreadable" | Wrong folder selected | Select the folder that directly contains `manifest.json` |
| Extension disappears after restart | Folder was moved or deleted | Keep the folder in a permanent location and load it again |
| Popup says "Not an Odoo page" on Odoo | Page not fully loaded, or a login/website page | Open a backend page (`/odoo` or `/web`) and wait for it to load |
| Debug buttons disabled | Not an Odoo backend page | Same as above |
| `Ctrl+.` does nothing | Shortcut not assigned or used by another extension | Check `chrome://extensions/shortcuts` |
| Barcode has no effect | Wrong screen or unknown barcode | Open the Barcode app screen, check the barcode exists in the database |
| Scans arrive too fast | Odoo is still loading | Increase both delay values |
| "Could not reach the page" | Page was reloaded or is restricted | Refresh the tab and try again |
| Badge shows `ERR` | Restricted page or capture failed | See the service worker console. Captures do not work on `chrome://` pages, the Chrome Web Store, or the new tab page |
| Screenshot has repeated headers | Unusual sticky layout | Scroll to top before capturing, or crop afterwards |
| Screenshot only shows one screen | No scrollable area detected | Use **Capture visible area**, or report the page layout |
| "This screenshot is no longer stored" | A newer capture replaced it | Take the screenshot again |
| Copy image fails | Clipboard permission or focus | Click inside the page first, then try again |
| Recorder says the tab cannot be captured | Restricted page, or the tab navigated since the recorder opened | Open the recorder again from the extension icon on that tab, or use **Screen or window** mode |
| No mouse pointer in the video, or it appears only after the first click | Chrome draws the pointer in tab capture only after the tab's window receives mouse events | Update to 1.4.4 or later (the tab is focused automatically). Otherwise move the mouse over the page after the countdown, or use **Screen or window** mode |
| Two mouse pointers in the video | Extension version 1.4.2 or older drew an extra pointer | Update to 1.4.3 or later, which records only the real pointer |
| Microphone not recorded | Permission blocked or no device | Allow the microphone for the extension in Chrome settings (`chrome://settings/content/microphone`) and check the level bar |
| No sound in screen recording | **Share audio** was not ticked, or the OS does not support system audio | Tick **Share audio** in the picker, or use **This tab** mode |
| `Alt+Shift+R` does nothing | Shortcut conflict | Change it at `chrome://extensions/shortcuts` |
| Entire screen or window recording is black | Older extension version recorded screen captures as MP4, which breaks when the capture size changes. On Linux with Wayland, screen capture can also fail | Update to 1.4.6 or later (records WebM). On Ubuntu with Wayland, make sure `chrome://flags/#enable-webrtc-pipewire-capturer` is enabled, or log in with **Ubuntu on Xorg**. Test with **Window** instead of **Entire Screen** |
| Video timeline not seekable in some players | WebM files from browsers have no duration header | Use **This tab** mode on Chrome 126+ for MP4, open WebM in VLC or a browser, or convert it with ffmpeg |
| "This recording is no longer stored" | A newer recording replaced it | Record again and download right away |
| Odoo OWL tab missing | DevTools was open before installing | Close and reopen DevTools |
| "No OWL app found" | Non-backend page or Odoo older than 16 | Open an Odoo 16+ backend page, click **Refresh tree** |
| Info tab shows `-` for model | Version-specific internals | Share the output of `!!odoo.__WOWL_DEBUG__, odoo.info` from the console |

---

## 16. Permissions and Privacy

| Permission | Why it is needed |
|---|---|
| `activeTab` | Access the current tab only after you click the icon or use a shortcut |
| `scripting` | Read Odoo info, switch debug mode, send barcodes, scroll during capture |
| `storage` | Save settings, saved barcodes and recording state locally |
| `tabCapture` | Record the current tab's video and audio after you open the recorder from it |

Privacy:

- No data is sent anywhere. There are no external servers, analytics or tracking.
- Screenshots and recordings are stored only in the browser's local IndexedDB, and only the latest of each is kept.
- The microphone is used only while recording, and only after you allow it. Screen sharing always goes through Chrome's own picker.
- The extension has no access to tabs you have not interacted with.

---

## 17. Known Limitations

- **Full page capture** stitches vertically only. Horizontal scrolling content is cut at the viewport width.
- **Very tall pages** are scaled down above 32000 device pixels.
- **Animated or lazy loading content** may look different between frames.
- **Only one screenshot** is stored at a time.
- **Saved barcodes** are limited to 6 items.
- **Screen recording** has no built-in editing (trim, cut, blur). Use a video editor afterwards.
- **Only one recording** is stored at a time.
- **System audio** from the entire screen works on Windows and ChromeOS only.
- **Screen and window recordings** are saved as WebM and limited to 1920 x 1080.
- **Webcam overlay** is not included.
- **Click highlights** are not available when sharing a window or the entire screen, and stop after a full page reload.
- **Closing the recorder window** during recording loses the video.
- **OWL inspector** is a lightweight version. It has no profiler, event log or reactivity tracking. Use Odoo's official Owl devtools for those.
- **Highlight** in the OWL panel uses the component's first element only, so components with several root elements are partly highlighted.
- **Odoo internals** (`__WOWL_DEBUG__`, action service structure) can change between versions, which may affect the Info tab and barcode service detection. Keyboard fallback still works for barcodes.

---

## 18. Publishing to the Chrome Web Store

Optional. Only needed if you want others to install it from the store.

1. Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee, 2-Step Verification required).
2. Update `version` in `manifest.json`.
3. Zip the folder so `manifest.json` is at the root of the zip.
4. Click **New item** and upload the zip.
5. Fill in:
   - **Store listing:** description, category, 128x128 icon, at least one 1280x800 screenshot, 440x280 promo tile.
   - **Privacy practices:** single purpose, justification for each permission (see [section 16](#16-permissions-and-privacy)), data usage (none collected).
   - **Distribution:** Public, Unlisted or Private.
6. Submit for review.

Use your own name, description and icons. Do not reuse names, logos or screenshots of other extensions.

---

## Appendix A: Keyboard Shortcut Reference

### Browser-wide

| Action | Keys |
|---|---|
| Toggle debug | `Ctrl+.` (`Cmd+.` on Mac) |
| Toggle assets | `Ctrl+.` twice quickly |
| Full page screenshot | `Alt+Shift+P` |
| Open recorder / stop recording | `Alt+Shift+R` |

### Screenshot editor

| Action | Keys |
|---|---|
| Crop | `C` |
| Pencil | `P` |
| Highlight | `H` |
| Line | `L` |
| Arrow | `A` |
| Box | `R` |
| Circle | `E` |
| Text | `T` |
| Hide | `X` |
| Straight lines / square / circle | Hold `Shift` while dragging |
| Cancel current drawing | `Esc` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |
| Download PNG | `Ctrl+S` |
| Copy image | `Ctrl+C` |

### Text tool

| Action | Keys |
|---|---|
| Place text | `Enter` |
| New line | `Shift+Enter` |
| Cancel | `Esc` |

---

## Appendix B: Project Structure

```
odoo-dev-toolkit/
├── manifest.json          Extension config, permissions, shortcuts
├── background.js          Service worker: shortcuts, capture, stitching, recorder window
├── lib/
│   └── db.js              IndexedDB storage for the latest screenshot and recording
├── popup/
│   ├── popup.html         Popup layout (Debug, Barcode, Screenshot, Video, Info)
│   ├── popup.css
│   └── popup.js           Debug switching, barcode list, video settings, record info
├── capture/
│   ├── capture.html       Screenshot editor page
│   ├── capture.css
│   └── capture.js         Crop, annotation tools, undo/redo, export
├── recorder/
│   ├── recorder.html      Recorder window (start, pause, mute, stop)
│   ├── recorder.css
│   ├── recorder.js        Tab/screen capture, audio mixing, MediaRecorder
│   ├── click-overlay.js   Click highlight rings drawn in the recorded tab
│   ├── result.html        Recording preview and download
│   ├── result.css
│   └── result.js
├── devtools/
│   ├── devtools.html      DevTools entry page
│   ├── devtools.js        Registers the "Odoo OWL" panel
│   ├── panel.html         Inspector layout
│   ├── panel.css
│   └── panel.js           Component tree, details, highlight, $owl
├── icons/                 16, 32, 48, 128 px icons
├── screenshots/           Images for this documentation
├── README.md
└── DOCUMENTATION.md       This file
```

---

## Appendix C: Screenshot Checklist

Save each image in `screenshots/` with these names.

| # | File name | What to capture |
|---|---|---|
| 01 | `01-overview.png` | Popup open on an Odoo page |
| 02 | `02-extracted-folder.png` | Extracted folder in the file manager |
| 03 | `03-developer-mode.png` | Developer mode toggle on |
| 04 | `04-load-unpacked.png` | Load unpacked button and folder picker |
| 05 | `05-extension-card.png` | Extension card on chrome://extensions |
| 06 | `06-pin-icon.png` | Pinning from the puzzle menu |
| 07 | `07-shortcuts.png` | chrome://extensions/shortcuts |
| 08 | `08-popup-header.png` | Header on Odoo and non-Odoo pages |
| 09 | `09-debug-tab.png` | Debug tab with current mode highlighted |
| 10 | `10-debug-enabled.png` | Odoo navbar with bug icon |
| 12 | `12-barcode-tab.png` | Barcode tab with saved items |
| 13 | `13-barcode-list-full.png` | "List is full" message |
| 14 | `14-barcode-console.png` | Console showing received barcodes |
| 15 | `15-screenshot-tab.png` | Screenshot tab in the popup |
| 16 | `16-capture-progress.png` | Progress badge on the icon |
| 17 | `17-editor-overview.png` | Editor with toolbar |
| 18 | `18-tool-examples.png` | One example of each drawing tool |
| 19 | `19-text-tool.png` | Typing text on the image |
| 20 | `20-hide-data.png` | Before and after hiding data |
| 21 | `21-crop-select.png` | Crop selection with dimmed area |
| 22 | `22-crop-result.png` | Image after cropping |
| 23 | `23-save-pdf.png` | Print dialog with Save as PDF |
| 24 | `24-record-tab.png` | Info tab on a form view |
| 25 | `25-owl-tab.png` | DevTools with Odoo OWL tab |
| 26 | `26-owl-highlight.png` | Hover highlight on the page |
| 27 | `27-owl-details.png` | Component details panel |
| 28 | `28-reload.png` | Reload button on the extension card |
| 29 | `29-video-tab.png` | Video tab in the popup |
| 30 | `30-recorder-ready.png` | Recorder window ready to start |
| 31 | `31-share-picker.png` | Chrome share picker with Share audio |
| 32 | `32-recorder-recording.png` | Recorder window while recording |
| 33 | `33-recording-badge.png` | Toolbar badge with recording time |
| 34 | `34-popup-recording.png` | Popup Video tab during recording |
| 35 | `35-recording-preview.png` | Recording preview page |
| 36 | `36-click-highlight.png` | Click ring in a recording |

> **Tip:** You can take most of these with the extension itself. Use **Capture visible area**, crop to the relevant part, add an arrow or box, and download as PNG.
