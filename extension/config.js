export const DEFAULT_API_BASE = 'http://89.169.182.64:5000';

export const SHARED_KEYS = {
    apiBase: 'apiBase',
    blacklist: 'blacklist',
    whitelist: 'whitelist',
    globalLoginEnabled: 'globalLoginEnabled',
    globalApiToken: 'globalApiToken',
    globalUserId: 'globalUserId',
    globalUsername: 'globalUsername',
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
        SHARED_KEYS.globalLoginEnabled,
        SHARED_KEYS.globalApiToken,
        SHARED_KEYS.globalUserId,
        SHARED_KEYS.globalUsername,
        pk.apiToken,
        pk.userId,
        pk.username,
        pk.autopostChannels,
    ];
    const d = await chrome.storage.local.get(keys);

    const globalEnabled = !!d[SHARED_KEYS.globalLoginEnabled];
    const apiToken =
        d[pk.apiToken] ||
        (globalEnabled ? d[SHARED_KEYS.globalApiToken] : null) ||
        null;
    const userId =
        d[pk.userId] ||
        (globalEnabled ? d[SHARED_KEYS.globalUserId] : null) ||
        null;
    const username =
        d[pk.username] ||
        (globalEnabled ? d[SHARED_KEYS.globalUsername] : null) ||
        null;

    return {
        windowId,
        apiBase: d[SHARED_KEYS.apiBase] || DEFAULT_API_BASE,
        apiToken,
        userId,
        username,
        autopostChannels: d[pk.autopostChannels] || [],
        blacklist: d[SHARED_KEYS.blacklist] ?? DEFAULT_BLACKLIST,
        whitelist: d[SHARED_KEYS.whitelist] ?? [],
        globalLoginEnabled: globalEnabled,
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
    const d = await chrome.storage.local.get([SHARED_KEYS.globalLoginEnabled]);
    if (d[SHARED_KEYS.globalLoginEnabled]) {
        set[SHARED_KEYS.globalApiToken] = apiToken;
        set[SHARED_KEYS.globalUserId] = userId;
        set[SHARED_KEYS.globalUsername] = username;
    }
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

export async function setGlobalLogin(enabled, currentAuth) {
    if (enabled) {
        await chrome.storage.local.set({
            [SHARED_KEYS.globalLoginEnabled]: true,
            [SHARED_KEYS.globalApiToken]: currentAuth?.apiToken ?? null,
            [SHARED_KEYS.globalUserId]: currentAuth?.userId ?? null,
            [SHARED_KEYS.globalUsername]: currentAuth?.username ?? null,
        });
    } else {
        await chrome.storage.local.set({
            [SHARED_KEYS.globalLoginEnabled]: false,
        });
        await chrome.storage.local.remove([
            SHARED_KEYS.globalApiToken,
            SHARED_KEYS.globalUserId,
            SHARED_KEYS.globalUsername,
        ]);
    }
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
