// Pages where Chrome does not allow extensions to inject scripts or capture
// content. Checked before any capture, debug switch or tab recording so the
// user gets a clear, quiet "not available here" instead of an error.

export const BLOCKED = [
  { test: (u) => u.startsWith("chrome://"), reason: "Chrome pages (chrome://)" },
  { test: (u) => u.startsWith("chrome-extension://"), reason: "Extension pages" },
  { test: (u) => u.startsWith("edge://"), reason: "Edge pages (edge://)" },
  { test: (u) => u.startsWith("devtools://"), reason: "DevTools pages" },
  { test: (u) => u.startsWith("view-source:"), reason: "View source pages" },
  { test: (u) => u.startsWith("about:"), reason: "Browser pages (about:)" },
  { test: (u) => /^https?:\/\/chromewebstore\.google\.com(\/|$)/.test(u), reason: "The Chrome Web Store" },
  { test: (u) => /^https?:\/\/chrome\.google\.com\/webstore(\/|$)/.test(u), reason: "The Chrome Web Store" },
];

// Returns a short reason when the URL is protected, otherwise null.
// An unknown URL (not visible to the extension) is not treated as blocked;
// the caller's own error handling covers that case.
export function captureBlockedReason(url) {
  if (!url) return null;
  const u = String(url).trim().toLowerCase();
  const hit = BLOCKED.find((b) => b.test(u));
  return hit ? `${hit.reason} cannot be captured or scripted by extensions.` : null;
}

// Script injection or capture errors that mean "protected page", not a bug.
export const PROTECTED_ERROR = /cannot be scripted|Cannot access|chrome:\/\/ URL/i;

export async function tabUrl(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url || tab.pendingUrl || "";
  } catch {
    return "";
  }
}
