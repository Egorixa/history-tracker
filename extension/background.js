import { ApiClient, ApiError } from "./api.js";
import { getConfig, perWindowKeys } from "./config.js";

const VISIT_DEBOUNCE_MS = 60_000;
const recentVisits = new Map();

async function clientForWindow(windowId) {
  if (!windowId) return null;
  const cfg = await getConfig(windowId);
  if (!cfg.apiToken) return null;
  return { api: new ApiClient(cfg.apiBase, cfg.apiToken), cfg };
}

function matchesRules(host, full, rules) {
  return rules.some((rule) => {
    const r = rule.toLowerCase();
    return host === r || host.endsWith("." + r) || full.startsWith(r);
  });
}

function isAllowedForAutopost(url, blacklist, whitelist) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.host.toLowerCase();
    const full = host + u.pathname;
    if (whitelist && whitelist.length > 0 && !matchesRules(host, full, whitelist)) return false;
    if (matchesRules(host, full, blacklist || [])) return false;
    return true;
  } catch {
    return false;
  }
}

function shouldDebounce(key) {
  const now = Date.now();
  const last = recentVisits.get(key);
  if (last && now - last < VISIT_DEBOUNCE_MS) return true;
  recentVisits.set(key, now);
  if (recentVisits.size > 500) {
    const cutoff = now - VISIT_DEBOUNCE_MS * 2;
    for (const [k, t] of recentVisits) if (t < cutoff) recentVisits.delete(k);
  }
  return false;
}

async function recordVisit(url, title, windowId) {
  const bundle = await clientForWindow(windowId);
  if (!bundle) return;
  const { api, cfg } = bundle;
  if (!cfg.autopostChannels || cfg.autopostChannels.length === 0) return;
  if (!isAllowedForAutopost(url, cfg.blacklist, cfg.whitelist)) return;
  if (shouldDebounce(`${windowId}:${url}`)) return;

  try {
    await api.postVisit(url, title ?? null, cfg.autopostChannels);
  } catch (e) {
    console.warn("[History Tracker] postVisit failed", e);
  }
}

async function updateActionBadge(tabId, url, windowId) {
  const clearBadge = () => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({ tabId, title: "History Tracker" }).catch(() => {});
  };
  if (!url || !(url.startsWith("http://") || url.startsWith("https://"))) {
    return clearBadge();
  }
  const bundle = await clientForWindow(windowId);
  if (!bundle) return clearBadge();
  try {
    const result = await bundle.api.lookup([url]);
    const visitors = (result && result[url]) || [];
    if (visitors.length === 0) return clearBadge();
    chrome.action.setBadgeText({ tabId, text: String(visitors.length) }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#5e81ff" }).catch(() => {});
    const names = visitors.map((v) => `${v.username}${v.channelName ? ` (#${v.channelName})` : ""}`).join(", ");
    chrome.action.setTitle({ tabId, title: `Здесь были: ${names}` }).catch(() => {});
  } catch {
    clearBadge();
  }
}

async function handleNavigation(details) {
  if (details.frameId !== 0) return;
  let tab;
  try { tab = await chrome.tabs.get(details.tabId); } catch { return; }
  if (!tab?.windowId) return;
  await recordVisit(details.url, tab.title ?? null, tab.windowId);

  await updateActionBadge(details.tabId, details.url, tab.windowId);
}

chrome.webNavigation.onCompleted.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return; }
  if (!tab?.url || !tab.windowId) return;
  await updateActionBadge(tabId, tab.url, tab.windowId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const windowId = sender.tab?.windowId;
      if (msg?.type === "lookup") {
        if (!windowId) return sendResponse({ ok: false, error: "no-window" });
        const bundle = await clientForWindow(windowId);
        if (!bundle) return sendResponse({ ok: false, error: "no-token" });
        const result = await bundle.api.lookup(msg.urls || []);
        return sendResponse({ ok: true, result });
      }
      if (msg?.type === "ping") {
        if (!windowId) return sendResponse({ ok: false });
        const cfg = await getConfig(windowId);
        return sendResponse({ ok: !!cfg.apiToken });
      }
      sendResponse({ ok: false, error: "unknown-message" });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : undefined;
      sendResponse({ ok: false, error: e.message, status });
    }
  })();
  return true;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const pk = perWindowKeys(windowId);
  await chrome.storage.local.remove([pk.apiToken, pk.userId, pk.username, pk.autopostChannels]);
  const prefix = `${windowId}:`;
  for (const k of Array.from(recentVisits.keys())) {
    if (k.startsWith(prefix)) recentVisits.delete(k);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const authChanged = Object.keys(changes).some((k) => k.startsWith("apiToken:w") || k === "apiBase");
  if (authChanged) recentVisits.clear();
});
