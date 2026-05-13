export const DEFAULT_API_BASE = 'http://89.169.182.64:5000';

export const SHARED_KEYS = {
    apiBase: 'apiBase',
    blacklist: 'blacklist',
    whitelist: 'whitelist',
};

export const DEFAULT_BLACKLIST = [
    'localhost',
    '127.0.0.1',
    'chrome.google.com',
    'mail.google.com',
    'accounts.google.com',
    'web.telegram.org',
    'github.com/login',
];

function wk(base, windowId) {
    return `${base}:w${windowId}`;
}

export function perWindowKeys(windowId) {
    return {
        apiToken: wk('apiToken', windowId),
        userId: wk('userId', windowId),
        username: wk('username', windowId),
        autopostChannels: wk('autopostChannels', windowId),
    };
}

export async function getCurrentWindowId() {
    const w = await chrome.windows.getCurrent();
    return w.id;
}

export async function getConfig(windowId) {
    const pk = perWindowKeys(windowId);
    const keys = [
        SHARED_KEYS.apiBase,
        SHARED_KEYS.blacklist,
        SHARED_KEYS.whitelist,
        pk.apiToken,
        pk.userId,
        pk.username,
        pk.autopostChannels,
    ];
    const d = await chrome.storage.local.get(keys);
    return {
        windowId,
        apiBase: d[SHARED_KEYS.apiBase] || DEFAULT_API_BASE,
        apiToken: d[pk.apiToken] || null,
        userId: d[pk.userId] || null,
        username: d[pk.username] || null,
        autopostChannels: d[pk.autopostChannels] || [],
        blacklist: d[SHARED_KEYS.blacklist] ?? DEFAULT_BLACKLIST,
        whitelist: d[SHARED_KEYS.whitelist] ?? [],
    };
}

export async function saveAuth(
    windowId,
    { apiBase, apiToken, userId, username },
) {
    const pk = perWindowKeys(windowId);
    const set = {
        [pk.apiToken]: apiToken,
        [pk.userId]: userId,
        [pk.username]: username,
    };
    if (apiBase) set[SHARED_KEYS.apiBase] = apiBase;
    await chrome.storage.local.set(set);
}

export async function clearAuth(windowId) {
    const pk = perWindowKeys(windowId);
    await chrome.storage.local.remove([
        pk.apiToken,
        pk.userId,
        pk.username,
        pk.autopostChannels,
    ]);
}

export async function saveSettings(
    windowId,
    { autopostChannels, blacklist, whitelist },
) {
    const pk = perWindowKeys(windowId);
    const set = {};
    if (autopostChannels !== undefined)
        set[pk.autopostChannels] = autopostChannels;
    if (blacklist !== undefined) set[SHARED_KEYS.blacklist] = blacklist;
    if (whitelist !== undefined) set[SHARED_KEYS.whitelist] = whitelist;
    await chrome.storage.local.set(set);
}
