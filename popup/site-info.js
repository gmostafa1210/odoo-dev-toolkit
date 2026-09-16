// Website inspector for non-Odoo pages.
// collectSiteInfo() is injected into the page (MAIN world) and must stay
// self-contained. Detection rules are written for this extension.

export function collectSiteInfo() {
  const doc = document;
  const w = window;
  const html = doc.documentElement;
  const $ = (sel) => doc.querySelector(sel);
  const meta = (name) =>
    ($(`meta[name="${name}" i]`) || $(`meta[property="${name}" i]`))?.getAttribute("content")?.trim() || "";
  const srcs = [...doc.scripts].map((s) => s.src).filter(Boolean);
  const hrefs = [...doc.querySelectorAll('link[rel~="stylesheet"][href], link[rel="preconnect"][href]')].map((l) => l.href);
  const assets = [...srcs, ...hrefs].join(" \n ").toLowerCase();
  const inline = [...doc.scripts].filter((s) => !s.src).map((s) => s.textContent.slice(0, 4000)).join("\n");
  const has = (needle) => assets.includes(needle);
  const safe = (fn) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  const generator = meta("generator");
  const gen = generator.toLowerCase();

  // [name, category, test, version?]
  const rules = [
    // Site builders and CMS
    ["WordPress", "CMS", () => gen.includes("wordpress") || has("/wp-content/") || has("/wp-includes/"), () => (gen.match(/wordpress ([\d.]+)/) || [])[1]],
    ["WooCommerce", "E-commerce", () => doc.body?.classList.contains("woocommerce") || has("woocommerce")],
    ["Shopify", "E-commerce", () => Boolean(w.Shopify) || has("cdn.shopify.com")],
    ["Magento", "E-commerce", () => has("/static/version") && has("mage") || Boolean(safe(() => w.require?.s?.contexts?._?.config?.paths?.mage))],
    ["PrestaShop", "E-commerce", () => Boolean(w.prestashop) || gen.includes("prestashop")],
    ["BigCommerce", "E-commerce", () => has("bigcommerce.com")],
    ["Wix", "Site builder", () => has("static.wixstatic.com") || has("parastorage.com") || gen.includes("wix")],
    ["Squarespace", "Site builder", () => has("squarespace") || Boolean(w.Static?.SQUARESPACE_CONTEXT)],
    ["Webflow", "Site builder", () => html.hasAttribute("data-wf-site") || gen.includes("webflow")],
    ["Framer", "Site builder", () => has("framerusercontent.com") || gen.includes("framer")],
    ["Ghost", "CMS", () => gen.includes("ghost"), () => (gen.match(/ghost ([\d.]+)/) || [])[1]],
    ["Drupal", "CMS", () => Boolean(w.Drupal) || gen.includes("drupal"), () => (gen.match(/drupal (\d+)/) || [])[1]],
    ["Joomla", "CMS", () => gen.includes("joomla")],
    ["Hugo", "Static site", () => gen.includes("hugo"), () => (gen.match(/hugo ([\d.]+)/) || [])[1]],
    ["Jekyll", "Static site", () => gen.includes("jekyll")],
    ["Docusaurus", "Static site", () => gen.includes("docusaurus") || Boolean($("#__docusaurus"))],

    // JavaScript frameworks
    ["Next.js", "JS framework", () => Boolean($("#__NEXT_DATA__") || w.next || w.__next_f), () => w.next?.version],
    ["Nuxt", "JS framework", () => Boolean(w.__NUXT__ || w.useNuxtApp || $("#__nuxt"))],
    ["React", "JS framework", () => Boolean(w.React || $("[data-reactroot]") || w.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size || $("#__next")), () => w.React?.version],
    ["Vue.js", "JS framework", () => Boolean(w.Vue || w.__VUE__ || $("[data-v-app]") || [...doc.querySelectorAll("*")].slice(0, 400).some((e) => e.__vue_app__ || e.__vue__)), () => w.Vue?.version],
    ["Angular", "JS framework", () => Boolean($("[ng-version]") || w.ng), () => $("[ng-version]")?.getAttribute("ng-version")],
    ["AngularJS", "JS framework", () => Boolean(w.angular?.version), () => w.angular?.version?.full],
    ["Svelte", "JS framework", () => Boolean($('[class*="svelte-"]'))],
    ["Astro", "JS framework", () => Boolean($("astro-island")) || gen.includes("astro"), () => (gen.match(/astro v?([\d.]+)/) || [])[1]],
    ["Gatsby", "JS framework", () => Boolean($("#___gatsby"))],
    ["Remix", "JS framework", () => Boolean(w.__remixContext)],
    ["Alpine.js", "JS library", () => Boolean(w.Alpine), () => w.Alpine?.version],
    ["htmx", "JS library", () => Boolean(w.htmx), () => w.htmx?.version],
    ["jQuery", "JS library", () => Boolean(w.jQuery?.fn?.jquery), () => w.jQuery?.fn?.jquery],
    ["Lodash", "JS library", () => Boolean(w._?.VERSION && w._?.chunk), () => w._?.VERSION],
    ["Three.js", "JS library", () => Boolean(w.THREE?.REVISION), () => w.THREE?.REVISION && `r${w.THREE.REVISION}`],

    // UI and fonts
    ["Bootstrap", "UI", () => Boolean(w.bootstrap) || has("bootstrap"), () => w.bootstrap?.Tooltip?.VERSION],
    ["Tailwind CSS", "UI", () => has("tailwind") || Boolean(safe(() => getComputedStyle(html).getPropertyValue("--tw-ring-color"))) || Boolean($('[class*="tw-"]'))],
    ["Font Awesome", "UI", () => has("fontawesome") || has("font-awesome")],
    ["Google Fonts", "Fonts", () => has("fonts.googleapis.com") || has("fonts.gstatic.com")],
    ["Adobe Fonts", "Fonts", () => has("use.typekit.net")],

    // Analytics and marketing
    ["Google Analytics", "Analytics", () => Boolean(w.gtag || w.ga) || has("google-analytics.com") || /gtag\(['"]config['"],\s*['"]G-/.test(inline)],
    ["Google Tag Manager", "Analytics", () => Boolean(w.google_tag_manager) || has("googletagmanager.com/gtm")],
    ["Meta Pixel", "Analytics", () => Boolean(w.fbq) || has("connect.facebook.net")],
    ["Microsoft Clarity", "Analytics", () => Boolean(w.clarity) || has("clarity.ms")],
    ["Hotjar", "Analytics", () => Boolean(w.hj) || has("hotjar.com")],
    ["Plausible", "Analytics", () => has("plausible.io") || Boolean(w.plausible)],
    ["Matomo", "Analytics", () => Boolean(w._paq || w.Matomo)],
    ["Mixpanel", "Analytics", () => Boolean(w.mixpanel?.track)],
    ["Segment", "Analytics", () => has("cdn.segment.com")],
    ["HubSpot", "Marketing", () => has("js.hs-scripts.com") || has("hs-analytics") || Boolean(w._hsq)],
    ["LinkedIn Insight", "Marketing", () => has("snap.licdn.com") || Boolean(w._linkedin_data_partner_ids)],

    // Payments, chat, security and other services
    ["Stripe", "Payments", () => has("js.stripe.com") || Boolean(w.Stripe)],
    ["PayPal", "Payments", () => has("paypal.com/sdk") || has("paypalobjects.com")],
    ["Intercom", "Live chat", () => Boolean(w.Intercom) || has("widget.intercom.io")],
    ["Crisp", "Live chat", () => Boolean(w.$crisp)],
    ["Tawk.to", "Live chat", () => Boolean(w.Tawk_API) || has("embed.tawk.to")],
    ["Zendesk", "Live chat", () => Boolean(w.zE) || has("static.zdassets.com")],
    ["WhatsApp chat", "Live chat", () => Boolean($('a[href*="wa.me/"], a[href*="api.whatsapp.com"]'))],
    ["reCAPTCHA", "Security", () => Boolean(w.grecaptcha) || has("recaptcha")],
    ["hCaptcha", "Security", () => Boolean(w.hcaptcha) || has("hcaptcha.com")],
    ["Cloudflare Turnstile", "Security", () => has("challenges.cloudflare.com")],
    ["Sentry", "Monitoring", () => Boolean(w.Sentry || w.__SENTRY__)],
    ["Cookiebot", "Privacy", () => Boolean(w.Cookiebot) || has("consent.cookiebot.com")],
    ["OneTrust", "Privacy", () => Boolean(w.OneTrust) || has("cookielaw.org")],
    ["YouTube embed", "Media", () => Boolean($('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com"]'))],
    ["Google Maps", "Media", () => Boolean(w.google?.maps) || Boolean($('iframe[src*="google.com/maps"]'))],
    ["jsDelivr", "CDN", () => has("cdn.jsdelivr.net")],
    ["cdnjs", "CDN", () => has("cdnjs.cloudflare.com")],
    ["unpkg", "CDN", () => has("unpkg.com")],
  ];

  const tech = [];
  for (const [name, category, test, version] of rules) {
    if (safe(test)) {
      const v = version ? safe(version) : undefined;
      tech.push({ name, category, version: v ? String(v) : "" });
    }
  }

  // Page performance
  const nav = safe(() => performance.getEntriesByType("navigation")[0]);
  const resources = safe(() => performance.getEntriesByType("resource")) || [];
  const bytes = resources.reduce((a, r) => a + (r.transferSize || 0), 0) + (nav?.transferSize || 0);

  const info = {
    url: location.href,
    host: location.hostname,
    https: location.protocol === "https:",
    title: doc.title || "",
    lang: html.lang || "",
    charset: doc.characterSet || "",
    generator,
    description: meta("description"),
    canonical: $('link[rel="canonical"]')?.href || "",
    robots: meta("robots"),
    ogTitle: meta("og:title"),
    ogImage: meta("og:image"),
    viewport: Boolean(meta("viewport")),
    h1: doc.querySelectorAll("h1").length,
    favicon: Boolean($('link[rel~="icon"]')),
    loadMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    domReadyMs: nav && nav.domContentLoadedEventEnd > 0 ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
    requests: resources.length + 1,
    transferKb: Math.round(bytes / 1024),
    domNodes: doc.getElementsByTagName("*").length,
    tech,
    headers: {},
  };

  // Response headers of this page (same-origin request, short timeout).
  const pick = ["server", "x-powered-by", "cf-ray", "x-vercel-id", "x-nf-request-id", "x-served-by", "x-amz-cf-id",
    "via", "strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options",
    "referrer-policy", "permissions-policy"];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  return fetch(location.href, { method: "HEAD", credentials: "same-origin", cache: "no-store", signal: ctrl.signal })
    .then((res) => {
      for (const k of pick) {
        const v = res.headers.get(k);
        if (v) info.headers[k] = v.slice(0, 300);
      }
    })
    .catch(() => {
      info.headersUnavailable = true;
    })
    .then(() => {
      clearTimeout(timer);
      const h = info.headers;
      const add = (name, category, version = "") => {
        if (!info.tech.some((t) => t.name === name)) info.tech.push({ name, category, version });
      };
      const server = (h.server || "").toLowerCase();
      if (h["cf-ray"] || server.includes("cloudflare")) add("Cloudflare", "CDN");
      if (h["x-vercel-id"] || server.includes("vercel")) add("Vercel", "Hosting");
      if (h["x-nf-request-id"] || server.includes("netlify")) add("Netlify", "Hosting");
      if (h["x-amz-cf-id"]) add("Amazon CloudFront", "CDN");
      if ((h["x-served-by"] || "").includes("cache-") || (h.via || "").toLowerCase().includes("varnish")) add("Fastly / Varnish", "CDN");
      if (server.includes("github.com")) add("GitHub Pages", "Hosting");
      for (const [key, name] of [["nginx", "Nginx"], ["apache", "Apache"], ["litespeed", "LiteSpeed"], ["caddy", "Caddy"], ["microsoft-iis", "IIS"], ["openresty", "OpenResty"], ["gws", "Google Web Server"]]) {
        if (server.includes(key)) add(name, "Web server", (server.match(new RegExp(`${key}/([\\d.]+)`)) || [])[1] || "");
      }
      const powered = (h["x-powered-by"] || "").toLowerCase();
      if (powered.includes("php")) add("PHP", "Language", (powered.match(/php\/([\d.]+)/) || [])[1] || "");
      if (powered.includes("express")) add("Express", "Web framework");
      if (powered.includes("asp.net")) add("ASP.NET", "Web framework");
      if (powered.includes("next.js")) add("Next.js", "JS framework");
      return info;
    });
}

export const CATEGORY_ORDER = [
  "CMS", "E-commerce", "Site builder", "Static site", "JS framework", "JS library", "Web framework", "Language",
  "UI", "Fonts", "Analytics", "Marketing", "Payments", "Live chat", "Security", "Monitoring", "Privacy", "Media",
  "Web server", "Hosting", "CDN",
];

export function reportText(info) {
  const lines = [`Website report: ${info.host}`, info.url, ""];
  lines.push(`Title: ${info.title || "-"}`);
  lines.push(`HTTPS: ${info.https ? "yes" : "no"}  Language: ${info.lang || "-"}  Charset: ${info.charset || "-"}`);
  if (info.generator) lines.push(`Generator: ${info.generator}`);
  lines.push("", "Technologies:");
  if (!info.tech.length) lines.push("  none detected");
  for (const t of info.tech) lines.push(`  ${t.category}: ${t.name}${t.version ? ` ${t.version}` : ""}`);
  lines.push("", "Performance:");
  lines.push(`  Load: ${info.loadMs != null ? `${info.loadMs} ms` : "-"}  Requests: ${info.requests}  Transferred: ${info.transferKb} KB  DOM nodes: ${info.domNodes}`);
  lines.push("", "SEO:");
  lines.push(`  Description: ${info.description || "missing"}`);
  lines.push(`  Canonical: ${info.canonical || "missing"}  H1 count: ${info.h1}  Viewport: ${info.viewport ? "yes" : "no"}`);
  const h = info.headers;
  lines.push("", "Server and security headers:");
  if (info.headersUnavailable) lines.push("  not available");
  for (const [k, v] of Object.entries(h)) lines.push(`  ${k}: ${v}`);
  lines.push("", "Generated by Dev Toolkit for Odoo");
  return lines.join("\n");
}
