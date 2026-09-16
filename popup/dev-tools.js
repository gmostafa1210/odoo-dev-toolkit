// Dev tab tools: field inspector toggle, field export, domain builder,
// record comparison and copy history.

import { odooFieldsMeta, odooReadRecord, odooCountDomain } from "./odoo-data.js";

const INSPECTOR_FILE = "content/field-inspector.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k in e && typeof v !== "string") e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
};

const HISTORY_KEY = "copyHistory";
const store = {
  get: (defaults) => chrome.storage.local.get(defaults),
  set: (patch) => chrome.storage.local.set(patch),
};

async function copyText(text, btn, meta = {}) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const { [HISTORY_KEY]: list = [] } = await store.get({ [HISTORY_KEY]: [] });
  const next = list.filter((x) => !(x.value === text && x.key === meta.key));
  next.unshift({ value: text.slice(0, 5000), key: meta.key || "", field: meta.field || "", label: meta.label || "", model: meta.model || "", host: meta.host || "", at: Date.now() });
  await store.set({ [HISTORY_KEY]: next.slice(0, 100) });
  if (btn) {
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1000);
  }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const note = (target, text, isError = false) => {
  target.textContent = text;
  target.classList.toggle("error", isError);
};

/* ------------------------------------------------------------------ */

export async function initDevTools({ tab, inPage, isOdoo, info }) {
  if (!isOdoo) return;
  const host = (() => {
    try {
      return new URL(info.url).host;
    } catch {
      return "";
    }
  })();

  const settings = await store.get({ inspectorEnabled: true, devOpen: {} });

  // Remember which sections are open.
  document.querySelectorAll("details.tool").forEach((d) => {
    if (settings.devOpen[d.id] != null) d.open = settings.devOpen[d.id];
    d.addEventListener("toggle", () => {
      settings.devOpen[d.id] = d.open;
      store.set({ devOpen: settings.devOpen });
      if (d.open) d.dispatchEvent(new Event("opened"));
    });
  });

  /* ---------------- Field inspector ---------------- */

  const inspectorToggle = $("#inspectorToggle");
  const inspectorNote = $("#inspectorNote");
  inspectorToggle.checked = settings.inspectorEnabled;

  const applyInspector = async (on) => {
    try {
      if (on) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [INSPECTOR_FILE] });
      if (on && !info.debug) {
        note(inspectorNote, "Turn on Debug mode to see Odoo's technical tooltips, then hover a field label, button or column header.");
      } else {
        note(inspectorNote, on ? "Active on this tab. Hover a field label, button or column header." : "Off.");
      }
    } catch {
      note(inspectorNote, "Could not start on this page.", true);
    }
  };
  inspectorToggle.addEventListener("change", async () => {
    // Open tabs follow this setting through storage change events.
    await store.set({ inspectorEnabled: inspectorToggle.checked });
    applyInspector(inspectorToggle.checked);
    renderAuto();
  });
  applyInspector(settings.inspectorEnabled);

  // Auto-start: permanent access to this Odoo site, so the inspector runs on
  // every page load without clicking the extension first.
  let sitePattern = "";
  try {
    const u = new URL(info.url);
    sitePattern = `${u.protocol}//${u.hostname}/*`; // any port on this host
  } catch {
    sitePattern = "";
  }
  const autoStatus = $("#autoStatus");
  const autoToggle = $("#autoToggle");
  const renderAuto = async () => {
    if (!sitePattern) {
      autoStatus.textContent = "Auto-start is not available for this page.";
      autoToggle.hidden = true;
      return;
    }
    const granted = await chrome.permissions.contains({ origins: [sitePattern] }).catch(() => false);
    const hostname = new URL(info.url).hostname;
    autoToggle.hidden = false;
    autoToggle.disabled = !inspectorToggle.checked;
    if (granted) {
      autoStatus.textContent = `Auto-start is on for ${hostname}. The card works on every page load.`;
      autoToggle.textContent = "Turn off";
    } else {
      autoStatus.textContent = `Auto-start is off for ${hostname}. After a page reload, open this popup once to start the card.`;
      autoToggle.textContent = "Allow this site";
    }
  };
  autoToggle.addEventListener("click", async () => {
    const granted = await chrome.permissions.contains({ origins: [sitePattern] }).catch(() => false);
    if (granted) {
      await chrome.permissions.remove({ origins: [sitePattern] }).catch(() => {});
    } else {
      // Chrome may close the popup while asking; the service worker finishes the setup.
      await chrome.permissions.request({ origins: [sitePattern] }).catch(() => false);
    }
    renderAuto();
  });
  renderAuto();

  /* ---------------- Shared field metadata ---------------- */

  let metaPromise = null;
  const loadMeta = () => (metaPromise ||= inPage(odooFieldsMeta).then((r) => r || { error: "Could not read this page." }));

  /* ---------------- Export fields ---------------- */

  const exportNote = $("#exportNote");
  const onlyView = $("#exportOnlyView");
  const exportRows = async () => {
    note(exportNote, "Reading fields…");
    const meta = await loadMeta();
    if (meta.error) {
      note(exportNote, meta.error, true);
      return null;
    }
    const view = new Set(meta.viewFields);
    let names = Object.keys(meta.fields).sort();
    if (onlyView.checked) names = names.filter((n) => view.has(n));
    const rows = names.map((n) => {
      const f = meta.fields[n];
      return {
        name: n,
        label: f.string || "",
        type: f.type || "",
        relation: f.relation || "",
        required: Boolean(f.required),
        readonly: Boolean(f.readonly),
        stored: f.store !== false,
        related: f.related ? [].concat(f.related).join(".") : "",
        in_view: view.has(n),
        selection: Array.isArray(f.selection) ? f.selection.map((s) => s.join("=")).join("; ") : "",
        groups: f.groups || "",
        help: (f.help || "").replace(/\s+/g, " ").trim(),
      };
    });
    note(exportNote, `${rows.length} fields from ${meta.model}${onlyView.checked ? " (in this view)" : ""}.`);
    return { model: meta.model, rows };
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  $("#exportCsv").addEventListener("click", async () => {
    const r = await exportRows();
    if (!r) return;
    const cols = Object.keys(r.rows[0] || { name: "" });
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...r.rows.map((row) => cols.map((c) => esc(row[c])).join(","))].join("\n");
    download(`fields_${r.model.replace(/\./g, "_")}_${stamp()}.csv`, "\ufeff" + csv, "text/csv");
  });
  $("#exportJson").addEventListener("click", async () => {
    const r = await exportRows();
    if (!r) return;
    download(`fields_${r.model.replace(/\./g, "_")}_${stamp()}.json`, JSON.stringify({ model: r.model, exported_at: new Date().toISOString(), fields: r.rows }, null, 2), "application/json");
  });
  $("#exportCopy").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const r = await exportRows();
    if (!r) return;
    await copyText(r.rows.map((x) => x.name).join("\n"), btn, { key: "field_names", model: r.model, host });
  });

  /* ---------------- Domain builder ---------------- */

  const OPS = {
    text: [["=", "is equal to"], ["!=", "is not equal to"], ["ilike", "contains"], ["not ilike", "does not contain"], ["in", "is in"], ["not in", "is not in"], ["set", "is set"], ["not set", "is not set"]],
    number: [["=", "="], ["!=", "!="], [">", ">"], [">=", ">="], ["<", "<"], ["<=", "<="], ["in", "is in"], ["not in", "is not in"], ["set", "is set"], ["not set", "is not set"]],
    date: [["=", "="], ["!=", "!="], [">", "after"], [">=", "on or after"], ["<", "before"], ["<=", "on or before"], ["set", "is set"], ["not set", "is not set"]],
    boolean: [["true", "is true"], ["false", "is false"]],
    selection: [["=", "is"], ["!=", "is not"], ["in", "is in"], ["not in", "is not in"], ["set", "is set"], ["not set", "is not set"]],
    many2one: [["=", "is (ID)"], ["!=", "is not (ID)"], ["ilike", "name contains"], ["in", "is in (IDs)"], ["not in", "is not in (IDs)"], ["set", "is set"], ["not set", "is not set"]],
    x2many: [["in", "contains IDs"], ["not in", "does not contain IDs"], ["ilike", "name contains"], ["set", "is set"], ["not set", "is not set"]],
  };
  const kindOf = (type) => ({
    char: "text", text: "text", html: "text",
    integer: "number", float: "number", monetary: "number",
    date: "date", datetime: "date",
    boolean: "boolean", selection: "selection", many2one: "many2one",
    one2many: "x2many", many2many: "x2many",
  }[type] || "text");

  const domainState = (await store.get({ domainState: null })).domainState;
  let dModel = domainState?.model || "";
  let conds = domainState?.conds || [];
  let joins = domainState?.joins || [];
  const dRoot = $("#domainRows");
  const dOut = $("#domainOut");
  const dNote = $("#domainNote");
  let fields = {};

  const saveDomain = () => store.set({ domainState: { model: dModel, conds, joins } });

  const py = (v) => {
    if (v === true) return "True";
    if (v === false) return "False";
    if (v == null) return "None";
    if (Array.isArray(v)) return `[${v.map(py).join(", ")}]`;
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  };

  const leafOf = (c) => {
    const f = fields[c.field];
    const kind = kindOf(f?.type);
    const num = kind === "number" || kind === "many2one" || kind === "x2many";
    const cast = (s) => {
      const t = String(s).trim();
      if (num && t !== "" && !Number.isNaN(Number(t))) return Number(t);
      return t;
    };
    if (c.op === "true") return [c.field, "=", true];
    if (c.op === "false") return [c.field, "=", false];
    if (c.op === "set") return [c.field, "!=", false];
    if (c.op === "not set") return [c.field, "=", false];
    if (c.op === "in" || c.op === "not in") {
      const list = String(c.value || "").split(",").map((x) => x.trim()).filter(Boolean).map(cast);
      return [c.field, c.op, list];
    }
    if (kind === "many2one" && (c.op === "=" || c.op === "!=")) return [c.field, c.op, cast(c.value)];
    return [c.field, c.op, kind === "number" ? cast(c.value) : String(c.value ?? "")];
  };

  const buildDomain = () => {
    const valid = conds.filter((c) => c.field && c.op);
    if (!valid.length) return [];
    const idx = conds.map((c, i) => (c.field && c.op ? i : -1)).filter((i) => i >= 0);
    const allAnd = idx.slice(1).every((i) => (joins[i - 1] || "AND") === "AND");
    if (allAnd) return valid.map(leafOf);
    let expr = [leafOf(conds[idx[0]])];
    for (let k = 1; k < idx.length; k++) {
      const op = (joins[idx[k] - 1] || "AND") === "OR" ? "|" : "&";
      expr = [op, ...expr, leafOf(conds[idx[k]])];
    }
    return expr;
  };

  const domainString = (d) => `[${d.map((t) => (typeof t === "string" ? py(t) : `(${t.map(py).join(", ")})`)).join(", ")}]`;

  const refreshOut = () => {
    dOut.textContent = domainString(buildDomain());
    saveDomain();
  };

  const renderDomain = () => {
    dRoot.replaceChildren();
    conds.forEach((c, i) => {
      if (i > 0) {
        const j = joins[i - 1] || "AND";
        dRoot.append(el("div", { class: "join" },
          el("button", { type: "button", class: `join-btn${j === "AND" ? " on" : ""}`, text: "AND", onclick: () => { joins[i - 1] = "AND"; renderDomain(); } }),
          el("button", { type: "button", class: `join-btn${j === "OR" ? " on" : ""}`, text: "OR", onclick: () => { joins[i - 1] = "OR"; renderDomain(); } })));
      }
      const f = fields[c.field];
      const kind = kindOf(f?.type);
      const ops = OPS[kind];
      if (!ops.some(([v]) => v === c.op)) c.op = ops[0][0];

      const fieldInput = el("input", {
        type: "text", value: c.field, placeholder: "field", list: "domainFieldList", spellcheck: "false",
        "aria-label": "Field", class: "d-field",
        onchange: (e) => { c.field = e.target.value.trim(); renderDomain(); },
      });
      const opSelect = el("select", { "aria-label": "Operator", class: "d-op", onchange: (e) => { c.op = e.target.value; renderDomain(); } },
        ...ops.map(([v, label]) => el("option", { value: v, text: label, selected: v === c.op })));

      let valueInput;
      const noValue = ["set", "not set", "true", "false"].includes(c.op);
      if (noValue) {
        valueInput = el("span", { class: "d-none" });
      } else if (kind === "selection" && Array.isArray(f?.selection) && (c.op === "=" || c.op === "!=")) {
        if (!f.selection.some(([k]) => k === c.value)) c.value = f.selection[0]?.[0] ?? "";
        valueInput = el("select", { "aria-label": "Value", class: "d-val", onchange: (e) => { c.value = e.target.value; refreshOut(); } },
          ...f.selection.map(([k, label]) => el("option", { value: k, text: label, selected: k === c.value })));
      } else {
        const hint = c.op === "in" || c.op === "not in" ? "comma separated" : kind === "date" ? (f?.type === "datetime" ? "YYYY-MM-DD HH:MM:SS" : "YYYY-MM-DD") : kind === "many2one" && c.op !== "ilike" ? "record ID" : "value";
        valueInput = el("input", {
          type: kind === "number" && !c.op.includes("in") ? "number" : "text",
          value: c.value ?? "", placeholder: hint, "aria-label": "Value", class: "d-val", spellcheck: "false",
          oninput: (e) => { c.value = e.target.value; refreshOut(); },
        });
      }
      const remove = el("button", { type: "button", class: "d-del", title: "Remove condition", "aria-label": "Remove condition", text: "✕",
        onclick: () => { conds.splice(i, 1); joins.splice(Math.max(0, i - 1), 1); renderDomain(); } });
      const type = el("span", { class: "d-type", text: f ? `${f.type}${f.relation ? ` · ${f.relation}` : ""}` : c.field ? "unknown field" : "" });
      dRoot.append(el("div", { class: "cond" }, fieldInput, opSelect, valueInput, remove, type));
    });
    refreshOut();
  };

  const loadDomainFields = async () => {
    const meta = await loadMeta();
    if (meta.error) {
      note(dNote, meta.error, true);
      return;
    }
    if (dModel !== meta.model) {
      dModel = meta.model;
      conds = [];
      joins = [];
    }
    fields = meta.fields;
    $("#domainModel").textContent = meta.model;
    const list = $("#domainFieldList");
    list.replaceChildren(...Object.keys(fields).sort().map((n) => el("option", { value: n, label: `${fields[n].string} (${fields[n].type})` })));
    if (!conds.length) conds.push({ field: "", op: "=", value: "" });
    note(dNote, "");
    renderDomain();
  };

  $("#domainAdd").addEventListener("click", () => {
    conds.push({ field: "", op: "=", value: "" });
    if (conds.length > 1) joins[conds.length - 2] = "AND";
    renderDomain();
    dRoot.querySelector(".cond:last-of-type .d-field")?.focus();
  });
  $("#domainClear").addEventListener("click", () => {
    conds = [{ field: "", op: "=", value: "" }];
    joins = [];
    renderDomain();
    note(dNote, "");
  });
  $("#domainCopy").addEventListener("click", (e) => copyText(dOut.textContent, e.currentTarget, { key: "domain", model: dModel, host }));
  $("#domainTest").addEventListener("click", async () => {
    note(dNote, "Counting…");
    const res = await inPage(odooCountDomain, [dModel, buildDomain()]);
    if (!res || res.error) note(dNote, res?.error || "Could not run the count.", true);
    else note(dNote, `${res.count.toLocaleString()} ${dModel} record${res.count === 1 ? "" : "s"} match.`);
  });
  const domainDetails = $("#toolDomain");
  domainDetails.addEventListener("opened", loadDomainFields);
  if (domainDetails.open) loadDomainFields();

  /* ---------------- Record comparison ---------------- */

  const cNote = $("#compareNote");
  const cRes = $("#compareResult");
  let snaps = (await store.get({ compareSnaps: {} })).compareSnaps;

  const fmt = (v, type, sel) => {
    if (v === false || v == null) return type === "boolean" ? "False" : "";
    if (type === "selection" && sel && sel[v] != null) return `${sel[v]} (${v})`;
    if (v === true) return "True";
    if (Array.isArray(v)) {
      if (type === "many2one" && v.length === 2) return `${v[1]} (${v[0]})`;
      return v.length ? `[${v.join(", ")}]` : "[]";
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const renderSnaps = () => {
    for (const side of ["A", "B"]) {
      const s = snaps[side];
      $(`#snap${side}`).textContent = s ? `${s.name} · ${s.model} #${s.resId}` : "Not captured";
      $(`#snap${side}`).title = s ? `Captured ${new Date(s.at).toLocaleString()}` : "";
    }
    $("#compareRun").disabled = !(snaps.A && snaps.B);
  };

  const capture = async (side) => {
    note(cNote, "Reading record…");
    const r = await inPage(odooReadRecord);
    if (!r || r.error) {
      note(cNote, r?.error || "Could not read the record.", true);
      return;
    }
    snaps[side] = r;
    await store.set({ compareSnaps: snaps });
    note(cNote, `Captured ${r.name} as ${side}.${side === "A" ? " Open another record and capture it as B." : ""}`);
    renderSnaps();
  };
  $("#captureA").addEventListener("click", () => capture("A"));
  $("#captureB").addEventListener("click", () => capture("B"));
  $("#compareSwap").addEventListener("click", async () => {
    snaps = { A: snaps.B, B: snaps.A };
    await store.set({ compareSnaps: snaps });
    renderSnaps();
  });
  $("#compareReset").addEventListener("click", async () => {
    snaps = {};
    await store.set({ compareSnaps: snaps });
    cRes.replaceChildren();
    note(cNote, "");
    renderSnaps();
  });

  let lastDiff = [];
  const runCompare = () => {
    const { A, B } = snaps;
    if (!A || !B) return;
    const showSame = $("#compareShowSame").checked;
    const names = [...new Set([...Object.keys(A.labels), ...Object.keys(B.labels)])]
      .filter((n) => !["id", "display_name", "write_date", "create_date", "write_uid", "create_uid"].includes(n))
      .sort((x, y) => (A.labels[x] || B.labels[x]).localeCompare(A.labels[y] || B.labels[y]));
    const rows = names.map((n) => {
      const type = A.types[n] || B.types[n];
      const a = fmt(A.values[n], type, A.selections?.[n]);
      const b = fmt(B.values[n], type, B.selections?.[n]);
      return { n, label: A.labels[n] || B.labels[n], a, b, same: a === b };
    });
    const diff = rows.filter((r) => !r.same);
    lastDiff = diff;
    const shown = showSame ? rows : diff;
    const warn = A.model !== B.model ? ` Different models (${A.model} vs ${B.model}), only shared field names are meaningful.` : "";
    note(cNote, `${diff.length} of ${rows.length} fields differ.${warn}`, Boolean(warn));
    const table = el("table", { class: "cmp" },
      el("thead", {}, el("tr", {}, el("th", { text: "Field" }), el("th", { text: "A" }), el("th", { text: "B" }))),
      el("tbody", {}, ...shown.map((r) => el("tr", { class: r.same ? "same" : "diff" },
        el("td", { title: r.n, text: r.label }),
        el("td", { title: r.a, text: r.a || "–" }),
        el("td", { title: r.b, text: r.b || "–" })))));
    cRes.replaceChildren(shown.length ? table : el("p", { class: "hint", text: "The records have the same values." }));
  };
  $("#compareRun").addEventListener("click", runCompare);
  $("#compareShowSame").addEventListener("change", () => cRes.childElementCount && runCompare());
  $("#compareCopy").addEventListener("click", (e) => {
    if (!lastDiff.length) return;
    const { A, B } = snaps;
    const text = [`A: ${A.name} (${A.model} #${A.resId})`, `B: ${B.name} (${B.model} #${B.resId})`, "",
      ...lastDiff.map((r) => `${r.label} [${r.n}]\n  A: ${r.a}\n  B: ${r.b}`)].join("\n");
    copyText(text, e.currentTarget, { key: "comparison", model: A.model, host });
  });
  renderSnaps();

  /* ---------------- Copy history ---------------- */

  const hList = $("#historyList");
  const hSearch = $("#historySearch");
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(t).toLocaleDateString();
  };
  const renderHistory = async () => {
    const { [HISTORY_KEY]: list = [] } = await store.get({ [HISTORY_KEY]: [] });
    const q = hSearch.value.trim().toLowerCase();
    const items = list.filter((x) => !q || [x.value, x.field, x.label, x.model, x.key].join(" ").toLowerCase().includes(q));
    $("#historyCount").textContent = String(list.length);
    if (!items.length) {
      hList.replaceChildren(el("li", { class: "empty", text: list.length ? "No matches." : "Nothing copied yet. Values you copy with the field inspector or these tools appear here." }));
      return;
    }
    hList.replaceChildren(...items.slice(0, 50).map((x) => {
      const meta = [x.label || x.field || x.key, x.model, ago(x.at)].filter(Boolean).join(" · ");
      const btn = el("button", { type: "button", class: "h-item", title: "Click to copy again" },
        el("span", { class: "h-val", text: x.value.length > 160 ? `${x.value.slice(0, 160)}…` : x.value }),
        el("span", { class: "h-meta", text: meta }));
      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(x.value);
        btn.classList.add("ok");
        setTimeout(() => btn.classList.remove("ok"), 800);
      });
      return el("li", {}, btn);
    }));
  };
  hSearch.addEventListener("input", renderHistory);
  $("#historyClear").addEventListener("click", async () => {
    await store.set({ [HISTORY_KEY]: [] });
    renderHistory();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[HISTORY_KEY]) renderHistory();
  });
  renderHistory();
}
