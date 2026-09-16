// Functions injected into the Odoo page (MAIN world). Each one is
// self-contained and uses Odoo's own ORM service, so no extra permissions
// or network access are needed.

export function odooFieldsMeta() {
  const env = window.odoo?.__WOWL_DEBUG__?.root?.env;
  const ctrl = env?.services?.action?.currentController;
  const model = ctrl?.props?.resModel || ctrl?.action?.res_model;
  if (!env?.services?.orm) return { error: "Odoo's data service is not available on this page." };
  if (!model) return { error: "Open a list, kanban or form view first." };

  // Fields visible in the current view (form widgets, list cells and headers).
  const viewFields = [...new Set(
    [...document.querySelectorAll(".o_field_widget[name], td.o_data_cell[name], th[data-name], .o_field_cell[name]")]
      .map((el) => el.getAttribute("name") || el.dataset.name)
      .filter((n) => n && /^[a-z_][a-z0-9_]*$/.test(n))
  )];

  return env.services.orm
    .call(model, "fields_get", [], {
      attributes: ["string", "type", "relation", "required", "readonly", "store", "help", "selection",
        "related", "company_dependent", "translate", "groups", "sortable"],
    })
    .then((fields) => ({ model, resId: ctrl?.props?.resId || null, viewFields, fields }))
    .catch((e) => ({ error: e?.data?.message || e?.message || "Could not read fields." }));
}

export function odooReadRecord() {
  const env = window.odoo?.__WOWL_DEBUG__?.root?.env;
  const ctrl = env?.services?.action?.currentController;
  const model = ctrl?.props?.resModel || ctrl?.action?.res_model;
  const resId = ctrl?.props?.resId;
  if (!env?.services?.orm) return { error: "Odoo's data service is not available on this page." };
  if (!model || !resId) return { error: "Open the form view of a saved record first." };
  const orm = env.services.orm;

  return orm
    .call(model, "fields_get", [], { attributes: ["string", "type", "selection"] })
    .then((meta) => {
      const skip = new Set(["binary", "image", "properties", "properties_definition"]);
      const names = Object.keys(meta).filter((n) => !skip.has(meta[n].type) && !n.startsWith("__"));
      return orm.call(model, "read", [[resId], names]).then((rows) => {
        const values = rows?.[0] || {};
        const labels = {};
        const types = {};
        const selections = {};
        for (const n of names) {
          labels[n] = meta[n].string || n;
          types[n] = meta[n].type;
          if (Array.isArray(meta[n].selection)) selections[n] = Object.fromEntries(meta[n].selection);
        }
        return {
          model,
          resId,
          name: values.display_name || `${model},${resId}`,
          labels,
          types,
          selections,
          values,
          at: Date.now(),
        };
      });
    })
    .catch((e) => ({ error: e?.data?.message || e?.message || "Could not read the record." }));
}

export function odooCountDomain(model, domain) {
  const orm = window.odoo?.__WOWL_DEBUG__?.root?.env?.services?.orm;
  if (!orm) return { error: "Odoo's data service is not available on this page." };
  return orm
    .call(model, "search_count", [domain])
    .then((count) => ({ count }))
    .catch((e) => ({ error: e?.data?.message || e?.message || "The domain is not valid." }));
}
