import { ApiClient, ApiError } from "./api.js";
import {
  getConfig, getCurrentWindowId, saveAuth, clearAuth, saveSettings,
  DEFAULT_API_BASE, DEFAULT_BLACKLIST
} from "./config.js";

const $ = (id) => document.getElementById(id);

const authSection = $("auth-section");
const mainSection = $("main-section");
const userBadge = $("user-badge");

let mode = "login";
let windowId = null;

async function init() {
  windowId = await getCurrentWindowId();
  const cfg = await getConfig(windowId);
  $("api-base").value = cfg.apiBase;
  if (cfg.apiToken) {
    await showMain(cfg);
  } else {
    showAuth();
  }
}

function showAuth() {
  authSection.classList.remove("hidden");
  mainSection.classList.add("hidden");
  userBadge.classList.add("hidden");
}

async function showMain(cfg) {
  authSection.classList.add("hidden");
  mainSection.classList.remove("hidden");
  userBadge.textContent = "@" + (cfg.username || "вы");
  userBadge.classList.remove("hidden");

  $("blacklist").value = (cfg.blacklist || DEFAULT_BLACKLIST).join("\n");
  await renderChannels(cfg);
  await renderDiscover(cfg, "");
}

async function renderChannels(cfg) {
  const list = $("channel-list");
  const subList = $("subscribed-list");
  list.innerHTML = "";
  subList.innerHTML = "";
  const api = new ApiClient(cfg.apiBase, cfg.apiToken);
  let channels = [];
  try {
    channels = await api.myChannels();
  } catch (e) {
    list.innerHTML = `<div class="channel-empty">Не удалось загрузить: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const owned = channels.filter((c) => c.role === "owner");
  const member = channels.filter((c) => c.role === "member");

  if (owned.length === 0) {
    list.innerHTML = '<div class="channel-empty">Каналов пока нет. Создайте новый ниже.</div>';
  } else {
    const selected = new Set(cfg.autopostChannels || []);
    for (const c of owned) {
      const row = document.createElement("label");
      row.className = "channel-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = c.id;
      cb.checked = selected.has(c.id);
      cb.dataset.channelId = c.id;
      const name = document.createElement("span");
      name.textContent = c.name;
      const meta = document.createElement("span");
      meta.className = "channel-meta";
      meta.textContent = c.visibility === 0 ? "публичный" : "приватный";
      row.append(cb, name, meta);
      list.appendChild(row);
    }
  }

  if (member.length === 0) {
    subList.innerHTML = '<div class="channel-empty">Подписок пока нет. Найдите каналы ниже.</div>';
  } else {
    for (const c of member) {
      const row = document.createElement("div");
      row.className = "channel-item";
      const name = document.createElement("span");
      name.textContent = c.name;
      const meta = document.createElement("span");
      meta.className = "channel-meta";
      meta.textContent = c.visibility === 0 ? "публичный" : "приватный";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inline secondary";
      btn.textContent = "Отписаться";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await api.unsubscribe(c.id, cfg.userId);
          await renderChannels(await getConfig(windowId));
          flashStatus(`Вы отписались от #${c.name}`);
        } catch (e) {
          btn.disabled = false;
          flashStatus(`Ошибка: ${e.message}`, true);
        }
      });
      row.append(name, meta, btn);
      subList.appendChild(row);
    }
  }
}

async function renderDiscover(cfg, query) {
  const list = $("discover-list");
  list.innerHTML = '<div class="channel-empty">Поиск…</div>';
  const api = new ApiClient(cfg.apiBase, cfg.apiToken);
  let channels;
  try {
    channels = await api.publicChannels(query || "");
  } catch (e) {
    list.innerHTML = `<div class="channel-empty">Ошибка: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const my = await api.myChannels().catch(() => []);
  const hidden = new Set(my.map((c) => c.id));
  const visible = channels.filter((c) => !hidden.has(c.id) && c.ownerId !== cfg.userId);

  list.innerHTML = "";
  if (visible.length === 0) {
    list.innerHTML = '<div class="channel-empty">Публичных каналов не найдено.</div>';
    return;
  }
  for (const c of visible) {
    const row = document.createElement("div");
    row.className = "channel-item";
    const name = document.createElement("span");
    name.textContent = c.name;
    const meta = document.createElement("span");
    meta.className = "channel-meta";
    meta.textContent = "публичный";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inline";
    btn.textContent = "Подписаться";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api.subscribe(c.id);
        await renderChannels(await getConfig(windowId));
        await renderDiscover(cfg, query);
        flashStatus(`Вы подписались на #${c.name}`);
      } catch (e) {
        btn.disabled = false;
        flashStatus(`Ошибка: ${e.message}`, true);
      }
    });
    row.append(name, meta, btn);
    list.appendChild(row);
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.tab;
      $("auth-submit").textContent = mode === "login" ? "Войти" : "Регистрация";
      $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
    });
  });
}

function bindAuth() {
  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("auth-error");
    errEl.textContent = "";
    const apiBase = $("api-base").value.trim() || DEFAULT_API_BASE;
    const username = $("username").value.trim();
    const password = $("password").value;
    const api = new ApiClient(apiBase, null);

    try {
      const res = mode === "register"
        ? await api.register(username, password)
        : await api.login(username, password);

      await saveAuth(windowId, {
        apiBase,
        apiToken: res.apiToken,
        userId: res.userId,
        username: res.username
      });
      const cfg = await getConfig(windowId);
      await showMain(cfg);
    } catch (e) {
      errEl.textContent = e instanceof ApiError
        ? (e.status === 401 ? "Неверный логин или пароль" : `Ошибка: ${e.message}`)
        : String(e);
    }
  });
}

function bindMain() {
  $("open-feed").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("feed.html") });
  });

  $("logout").addEventListener("click", async () => {
    await clearAuth(windowId);
    showAuth();
  });

  $("save").addEventListener("click", async () => {
    const cbs = document.querySelectorAll(".channel-item input[type=checkbox]");
    const selected = Array.from(cbs).filter((c) => c.checked).map((c) => c.value);
    const blacklist = $("blacklist").value
      .split("\n").map((l) => l.trim()).filter(Boolean);
    await saveSettings(windowId, { autopostChannels: selected, blacklist });
    flashStatus(`Сохранено: каналов — ${selected.length}, правил в чёрном списке — ${blacklist.length}`);
  });

  $("new-channel-create").addEventListener("click", async () => {
    const name = $("new-channel-name").value.trim();
    if (!name) return;
    const visibility = Number($("new-channel-visibility").value);
    const cfg = await getConfig(windowId);
    const api = new ApiClient(cfg.apiBase, cfg.apiToken);
    try {
      await api.createChannel(name, null, visibility);
      $("new-channel-name").value = "";
      const fresh = await getConfig(windowId);
      await renderChannels(fresh);
      await renderDiscover(fresh, "");
      flashStatus(`Создан #${name}`);
    } catch (e) {
      flashStatus(`Ошибка: ${e.message}`, true);
    }
  });

  $("discover-search").addEventListener("click", async () => {
    const q = $("discover-query").value.trim();
    const cfg = await getConfig(windowId);
    await renderDiscover(cfg, q);
  });

  $("discover-query").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("discover-search").click();
    }
  });
}

function flashStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#c23a3a" : "#3f8a3a";
  setTimeout(() => { el.textContent = ""; }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

bindTabs();
bindAuth();
bindMain();
init();
