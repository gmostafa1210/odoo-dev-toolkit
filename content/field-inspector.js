// Field inspector content script.
// Runs on Odoo sites where the user enabled auto-start (registered by the
// service worker), and when the popup is opened on an Odoo tab.
// When Odoo shows its technical (debug) tooltip for a field, button or list
// column, a card keeps the values on screen with a copy button for each.

(() => {
  function installFieldInspector() {
    if (window.__otkInspector) return "active";

    const HISTORY_KEY = "copyHistory";
    const HISTORY_MAX = 100;
    const TOOLTIP_SEL = ".o-tooltip--technical, .oe_tooltip_technical";

    const host = document.createElement("div");
    host.setAttribute("data-otk-inspector", "");
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;display:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .card { width: 330px; max-height: 60vh; display: flex; flex-direction: column; overflow: hidden;
          font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430;
          background: #fff; border: 1px solid #e4dfe3; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.22); }
        header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #714B67; color: #fff; }
        header .t { flex: 1; min-width: 0; }
        header .k { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; opacity: .8; }
        header .n { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        header button { border: 0; background: rgba(255,255,255,.15); color: #fff; border-radius: 5px; padding: 3px 7px; font: inherit; cursor: pointer; }
        header button[aria-pressed="true"] { background: #fff; color: #714B67; font-weight: 600; }
        .rows { overflow: auto; padding: 4px 0; }
        .row { display: grid; grid-template-columns: 82px 1fr 26px; gap: 6px; align-items: start; padding: 4px 10px; }
        .row:hover { background: #f7f4f6; }
        .label { color: #6b6f7b; padding-top: 2px; }
        .val { font: 11.5px/1.45 ui-monospace, Consolas, monospace; word-break: break-word; max-height: 64px; overflow: auto; }
        .copy { width: 24px; height: 22px; border: 1px solid #e4dfe3; border-radius: 5px; background: #fff; cursor: pointer; color: #714B67; font-size: 12px; }
        .copy:hover { border-color: #714B67; }
        .copy.ok { background: #017E84; border-color: #017E84; color: #fff; }
        footer { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #e4dfe3; background: #faf8f9; }
        footer button { flex: 1; padding: 5px 6px; border: 1px solid #e4dfe3; border-radius: 6px; background: #fff; font: inherit; cursor: pointer; }
        footer button:hover { border-color: #714B67; }
        footer button.ok { background: #017E84; border-color: #017E84; color: #fff; }
        button:focus-visible { outline: 2px solid #017E84; outline-offset: 1px; }
        .hint { padding: 0 10px 8px; color: #6b6f7b; font-size: 11px; }
      </style>
      <div class="card" role="dialog" aria-label="Field inspector">
        <header>
          <div class="t"><div class="k">Field inspector</div><div class="n" id="name"></div></div>
          <button id="pin" type="button" aria-pressed="false" title="Keep this card when other tooltips open">Pin</button>
          <button id="close" type="button" title="Close">✕</button>
        </header>
        <div class="rows" id="rows"></div>
        <div class="hint">Click ⧉ to copy a value. Copied values are saved to the Dev tab history.</div>
        <footer>
          <button id="copyAll" type="button">Copy all</button>
          <button id="copyJson" type="button">Copy JSON</button>
        </footer>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    const $ = (id) => shadow.getElementById(id);
    let pinned = false;
    let current = null;

    const writeClipboard = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      }
    };

    const remember = (value, key) => {
      try {
        chrome.storage.local.get({ [HISTORY_KEY]: [] }, (res) => {
          const list = (res[HISTORY_KEY] || []).filter((x) => !(x.value === value && x.key === key));
          list.unshift({
            value: String(value).slice(0, 5000),
            key,
            field: current?.field || "",
            label: current?.label || "",
            model: current?.model || "",
            host: location.host,
            at: Date.now(),
          });
          chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, HISTORY_MAX) });
        });
      } catch {
        // Extension was reloaded: history is skipped, copying still works.
      }
    };

    const flash = (btn, text) => {
      const old = btn.textContent;
      btn.classList.add("ok");
      if (text) btn.textContent = text;
      setTimeout(() => {
        btn.classList.remove("ok");
        btn.textContent = old;
      }, 900);
    };

    const copy = async (btn, value, key, doneText) => {
      if (await writeClipboard(value)) {
        remember(value, key);
        flash(btn, doneText);
      }
    };

    const keyOf = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    const parse = (list) => {
      const tip = list.closest(".o-tooltip, .popover, .tooltip, .oe_tooltip") || list.parentElement;
      const heading = tip?.querySelector(".o-tooltip--string, .oe_tooltip_string")?.textContent?.trim() || "";
      const rows = [];
      for (const li of list.querySelectorAll(":scope > li")) {
        const titleEl = li.querySelector(".o-tooltip--technical--title, .oe_tooltip_technical_title");
        const label = (titleEl?.textContent || "").replace(/:\s*$/, "").trim();
        const clone = li.cloneNode(true);
        clone.querySelector(".o-tooltip--technical--title, .oe_tooltip_technical_title")?.remove();
        const nested = [...clone.querySelectorAll("li")].map((x) => x.textContent.trim()).filter(Boolean);
        const value = nested.length ? nested.join("\n") : clone.textContent.replace(/\s+/g, " ").trim();
        if (!label && !value) continue;
        rows.push({ key: li.dataset.item || keyOf(label), label: label || li.dataset.item || "Value", value });
      }
      const get = (...keys) => rows.find((r) => keys.includes(r.key))?.value || "";
      return {
        label: heading,
        field: get("field", "button_name", "name"),
        model: get("object", "model", "relation_model"),
        rows,
      };
    };

    const render = (data) => {
      current = data;
      $("name").textContent = data.label || data.field || "Technical details";
      const rowsEl = $("rows");
      rowsEl.replaceChildren();
      for (const r of data.rows) {
        const row = document.createElement("div");
        row.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = r.label;
        const v = document.createElement("div");
        v.className = "val";
        v.textContent = r.value || "-";
        const b = document.createElement("button");
        b.className = "copy";
        b.type = "button";
        b.textContent = "⧉";
        b.title = `Copy ${r.label}`;
        b.setAttribute("aria-label", `Copy ${r.label}`);
        b.disabled = !r.value;
        b.addEventListener("click", () => copy(b, r.value, r.key, "✓"));
        row.append(l, v, b);
        rowsEl.append(row);
      }
      host.style.display = "block";
    };

    $("close").addEventListener("click", () => {
      host.style.display = "none";
      pinned = false;
      $("pin").setAttribute("aria-pressed", "false");
    });
    $("pin").addEventListener("click", () => {
      pinned = !pinned;
      $("pin").setAttribute("aria-pressed", String(pinned));
    });
    $("copyAll").addEventListener("click", (e) => {
      if (!current) return;
      const text = current.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
      copy(e.currentTarget, text, "all", "Copied");
    });
    $("copyJson").addEventListener("click", (e) => {
      if (!current) return;
      const obj = {};
      for (const r of current.rows) obj[r.key] = r.value;
      copy(e.currentTarget, JSON.stringify(obj, null, 2), "json", "Copied");
    });

    let lastSignature = "";
    const scan = (node) => {
      if (pinned || !(node instanceof Element)) return;
      const list = node.matches?.(TOOLTIP_SEL) ? node : node.querySelector?.(TOOLTIP_SEL);
      if (!list || host.contains(list)) return;
      const data = parse(list);
      if (!data.rows.length) return;
      const sig = JSON.stringify(data.rows);
      if (sig === lastSignature && host.style.display === "block") return;
      lastSignature = sig;
      render(data);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) for (const n of m.addedNodes) scan(n);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    window.__otkInspector = {
      remove() {
        observer.disconnect();
        host.remove();
        delete window.__otkInspector;
      },
    };
    return "installed";
  }

  function start() {
    // Only the Odoo web client shows technical tooltips.
    const isOdooClient = () => document.body?.classList.contains("o_web_client") || document.querySelector(".o_web_client, .o_action_manager");
    if (isOdooClient()) {
      installFieldInspector();
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      if (isOdooClient()) {
        clearInterval(timer);
        installFieldInspector();
      } else if (++tries > 20) {
        clearInterval(timer);
      }
    }, 500);
  }

  if (window.__otkInspectorLoaded) {
    // Injected again (for example from the popup): just re-check the setting.
    chrome.storage.local.get({ inspectorEnabled: true }, (s) => {
      if (s.inspectorEnabled && !window.__otkInspector) start();
    });
    return;
  }
  window.__otkInspectorLoaded = true;

  chrome.storage.local.get({ inspectorEnabled: true }, (s) => {
    if (s.inspectorEnabled) start();
  });

  // Follow the on/off switch in the popup without a page reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.inspectorEnabled) return;
    if (changes.inspectorEnabled.newValue) {
      if (!window.__otkInspector) start();
    } else {
      window.__otkInspector?.remove();
    }
  });
})();
