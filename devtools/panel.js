/* OWL component inspector (lite). Runs in the DevTools panel and talks to
   the inspected page through chrome.devtools.inspectedWindow.eval. */

// Installed into the inspected page as window.__OTK__.
function pageHelper() {
  if (window.__OTK__) return;
  const nodes = new Map();
  const ids = new WeakMap();
  let seq = 0;
  const STATUS = ["new", "mounted", "cancelled", "destroyed"];

  const idOf = (n) => {
    if (!ids.has(n)) ids.set(n, ++seq);
    const id = ids.get(n);
    nodes.set(id, n);
    return id;
  };

  const asNode = (x) => {
    if (!x) return null;
    if (x.__owl__) return x.__owl__; // component instance
    if (x.component) return x; // ComponentNode
    if (x.node && x.node.component) return x.node;
    return null;
  };

  const roots = () => {
    const found = [];
    const add = (x) => {
      const n = asNode(x);
      if (n && !found.includes(n)) found.push(n);
    };
    const apps = new Set([
      ...((window.__OWL_DEVTOOLS__ && window.__OWL_DEVTOOLS__.apps) || []),
      ...((window.owl && window.owl.App && window.owl.App.apps) || []),
    ]);
    for (const app of apps) add(app.root);
    add(window.odoo && window.odoo.__WOWL_DEBUG__ && window.odoo.__WOWL_DEBUG__.root);
    return found;
  };

  const nameOf = (n) =>
    (n.component && n.component.constructor && n.component.constructor.name) || "Anonymous";

  const walk = (n, depth) => ({
    id: idOf(n),
    name: nameOf(n),
    children: depth > 80 ? [] : Object.values(n.children || {}).map((c) => walk(c, depth + 1)),
  });

  const short = (v) => {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return JSON.stringify(v.length > 120 ? v.slice(0, 120) + "…" : v);
    if (t === "number" || t === "boolean" || t === "undefined" || t === "bigint") return String(v);
    if (t === "symbol") return v.toString();
    if (t === "function") return `ƒ ${v.name || "anonymous"}()`;
    if (v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? "#" + v.id : ""}>`;
    if (Array.isArray(v)) return `Array(${v.length})`;
    if (v instanceof Map || v instanceof Set) return `${v.constructor.name}(${v.size})`;
    const ctor = v.constructor && v.constructor.name;
    return ctor && ctor !== "Object" ? `${ctor} {…}` : "{…}";
  };

  const preview = (v) => {
    try {
      if (Array.isArray(v)) {
        const items = v.slice(0, 10).map(short).join(", ");
        return `[${items}${v.length > 10 ? `, … ${v.length - 10} more` : ""}]`;
      }
      if (v && typeof v === "object" && !(v instanceof Element)) {
        const ctor = v.constructor && v.constructor.name;
        const keys = Object.keys(v);
        const body = keys.slice(0, 10).map((k) => {
          let val;
          try { val = short(v[k]); } catch (e) { val = "<error>"; }
          return `${k}: ${val}`;
        }).join(", ");
        const prefix = ctor && ctor !== "Object" ? ctor + " " : "";
        return `${prefix}{${body}${keys.length > 10 ? `, … ${keys.length - 10} more` : ""}}`;
      }
      return short(v);
    } catch (e) {
      return "<unreadable>";
    }
  };

  const entries = (obj, skip = []) => {
    if (!obj) return [];
    return Object.keys(obj)
      .filter((k) => !skip.includes(k))
      .map((k) => {
        try { return [k, preview(obj[k])]; } catch (e) { return [k, "<error>"]; }
      });
  };

  const firstEl = (n) => {
    try {
      let f = typeof n.firstNode === "function" ? n.firstNode() : n.bdom && n.bdom.firstNode();
      while (f && f.nodeType !== 1) f = f.nextSibling;
      return f || null;
    } catch (e) {
      return null;
    }
  };

  window.__OTK__ = {
    tree() {
      nodes.clear();
      return roots().map((r) => walk(r, 0));
    },
    details(id) {
      const n = nodes.get(id);
      if (!n) return null;
      const c = n.component;
      return {
        name: nameOf(n),
        status: STATUS[n.status] || String(n.status),
        template: String(c.constructor.template || ""),
        props: entries(n.props || c.props),
        state: entries(c, ["env", "props", "__owl__"]),
        env: c.env ? Object.keys(c.env).sort() : [],
        hasElement: Boolean(firstEl(n)),
      };
    },
    el(id) {
      const n = nodes.get(id);
      return n ? firstEl(n) : null;
    },
    component(id) {
      const n = nodes.get(id);
      return n ? n.component : null;
    },
    highlight(id, label) {
      this.unhighlight();
      const el = this.el(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.id = "__otk_highlight";
      Object.assign(box.style, {
        position: "fixed", left: r.left + "px", top: r.top + "px",
        width: r.width + "px", height: r.height + "px",
        background: "rgba(113,75,103,.18)", outline: "2px solid #714B67",
        zIndex: 2147483647, pointerEvents: "none",
      });
      const tag = document.createElement("div");
      tag.textContent = `${label}  ${Math.round(r.width)} x ${Math.round(r.height)}`;
      Object.assign(tag.style, {
        position: "absolute", left: "0", top: r.top > 22 ? "-22px" : "100%",
        background: "#714B67", color: "#fff", font: "11px/20px monospace",
        padding: "0 6px", whiteSpace: "nowrap",
      });
      box.appendChild(tag);
      document.documentElement.appendChild(box);
      return true;
    },
    unhighlight() {
      const old = document.getElementById("__otk_highlight");
      if (old) old.remove();
    },
  };
}

/* ---------------- Page bridge ---------------- */

const HELPER = `(${pageHelper.toString()})()`;

function evalPage(expr) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expr, (result, exc) => {
      if (exc) reject(new Error(exc.value || exc.description || exc.code || "Evaluation failed"));
      else resolve(result);
    });
  });
}

async function call(method, ...args) {
  await evalPage(HELPER);
  return evalPage(`window.__OTK__.${method}(${args.map((a) => JSON.stringify(a)).join(",")})`);
}

/* ---------------- UI ---------------- */

const treeEl = document.getElementById("tree");
const detailsEl = document.getElementById("details");
const filterEl = document.getElementById("filter");
const countEl = document.getElementById("count");
const hoverEl = document.getElementById("hoverHl");
let selectedId = null;

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
};

function renderNode(data, depth) {
  const hasKids = data.children.length > 0;
  const twisty = h("span", { class: "twisty" }, hasKids ? "▾" : "");
  const row = h("div", { class: "row" }, twisty, h("span", { class: "name" }, data.name));
  const children = h("div", { class: "children", role: "group" });
  const node = h("div", { class: "node", role: "treeitem", "data-id": data.id, "data-name": data.name.toLowerCase() }, row, children);

  if (depth >= 4 && hasKids) {
    node.classList.add("collapsed");
    twisty.textContent = "▸";
  }
  twisty.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = node.classList.toggle("collapsed");
    twisty.textContent = collapsed ? "▸" : "▾";
  });
  row.addEventListener("click", () => select(data.id, node));
  row.addEventListener("mouseenter", () => hoverEl.checked && call("highlight", data.id, data.name).catch(() => {}));
  row.addEventListener("mouseleave", () => hoverEl.checked && call("unhighlight").catch(() => {}));

  for (const child of data.children) children.append(renderNode(child, depth + 1));
  return node;
}

async function refresh() {
  treeEl.textContent = "";
  try {
    const roots = await call("tree");
    if (!roots || !roots.length) {
      treeEl.append(h("p", { class: "empty" }, "No OWL app found on this page. Open an Odoo 16+ backend page and click Refresh tree."));
      countEl.textContent = "";
      return;
    }
    roots.forEach((r) => treeEl.append(renderNode(r, 0)));
    countEl.textContent = `${treeEl.querySelectorAll(".node").length} components`;
    applyFilter();
    if (selectedId) {
      const again = treeEl.querySelector(`.node[data-id="${selectedId}"]`);
      if (again) select(selectedId, again);
    }
  } catch (e) {
    treeEl.append(h("p", { class: "error" }, `Could not read the page: ${e.message}`));
  }
}

function applyFilter() {
  const q = filterEl.value.trim().toLowerCase();
  const all = [...treeEl.querySelectorAll(".node")];
  all.forEach((n) => n.classList.remove("hidden", "match"));
  if (!q) return;
  all.forEach((n) => n.classList.add("hidden"));
  for (const n of all) {
    if (!n.dataset.name.includes(q)) continue;
    n.classList.add("match");
    for (let p = n; p && p !== treeEl; p = p.parentElement) {
      if (p.classList.contains("node")) {
        p.classList.remove("hidden");
        if (p !== n) p.classList.remove("collapsed");
      }
    }
  }
}

function table(rows) {
  if (!rows.length) return h("p", { class: "empty" }, "None");
  return h("table", {}, ...rows.map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v))));
}

async function select(id, nodeEl) {
  selectedId = id;
  treeEl.querySelectorAll(".node.selected").forEach((n) => n.classList.remove("selected"));
  nodeEl.classList.add("selected");

  let d;
  try {
    d = await call("details", id);
  } catch (e) {
    detailsEl.replaceChildren(h("p", { class: "error" }, e.message));
    return;
  }
  if (!d) {
    detailsEl.replaceChildren(h("p", { class: "empty" }, "This component no longer exists. Refresh the tree."));
    return;
  }

  const actions = h(
    "div",
    { class: "actions" },
    h("button", {
      onclick: () => evalPage(`inspect(window.__OTK__.el(${id}))`),
      ...(d.hasElement ? {} : { disabled: "" }),
    }, "Show in Elements"),
    h("button", {
      onclick: () =>
        evalPage(`window.$owl = window.__OTK__.component(${id}); console.log("%c$owl", "color:#714B67;font-weight:bold", window.$owl)`),
    }, "Store as $owl in console"),
    h("button", { onclick: () => call("highlight", id, d.name) }, "Highlight")
  );

  detailsEl.replaceChildren(
    h("h2", {}, d.name),
    h("p", { class: "sub" }, `Status: ${d.status}${d.template ? `, template: ${d.template}` : ""}`),
    actions,
    h("h3", {}, "Props"),
    table(d.props),
    h("h3", {}, "Instance fields and state"),
    table(d.state),
    h("h3", {}, "Env keys"),
    h("p", { class: "sub" }, d.env.join(", ") || "None")
  );
}

document.getElementById("refresh").addEventListener("click", refresh);
filterEl.addEventListener("input", applyFilter);
chrome.devtools.network.onNavigated.addListener(() => {
  selectedId = null;
  detailsEl.replaceChildren(h("p", { class: "empty" }, "Select a component to see its props and state."));
  setTimeout(refresh, 1500); // give Odoo time to mount the webclient
});

refresh();
