import { ApiClient, ApiError } from "./api.js";
import {
  getConfig, getCurrentWindowId, saveAuth, clearAuth, saveSettings,
  setGlobalLogin, DEFAULT_API_BASE, DEFAULT_BLACKLIST
} from "./config.js";

const openMemberPanels = new Set();

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
  $("whitelist").value = (cfg.whitelist || []).join("\n");
  $("global-login").checked = !!cfg.globalLoginEnabled;
  await renderChannels(cfg);
  await renderDiscover(cfg, "");
  await renderCurrentTab(cfg);
  await renderChatChannelSelect(cfg);
}

async function renderChatChannelSelect(cfg) {
  const sel = $("chat-channel-select");
  sel.innerHTML = "";
  const api = new ApiClient(cfg.apiBase, cfg.apiToken);
  let list;
  try {
    list = await api.myChannels();
  } catch {
    return;
  }
  if (!list || list.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет каналов";
    sel.appendChild(opt);
    sel.disabled = true;
    $("open-chat").disabled = true;
    return;
  }
  sel.disabled = false;
  $("open-chat").disabled = false;
  for (const c of list) {
    const opt = document.createElement("option");
    opt.value = c.id;
    const tag = c.role === "owner" ? "★" : "•";
    opt.textContent = `${tag} ${c.name}`;
    sel.appendChild(opt);
  }
}

async function renderCurrentTab(cfg) {
  const urlEl = $("current-tab-url");
  const visitorsEl = $("current-tab-visitors");
  const postBtn = $("post-current-tab");
  visitorsEl.innerHTML = "";

  const tab = await getActiveTab();
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
    urlEl.textContent = "Нет активной http(s)-вкладки";
    postBtn.disabled = true;
    return;
  }
  urlEl.textContent = tab.url;
  postBtn.disabled = false;

  const api = new ApiClient(cfg.apiBase, cfg.apiToken);
  let visitors = [];
  try {
    const result = await api.lookup([tab.url]);
    visitors = (result && result[tab.url]) || [];
  } catch (e) {
    visitorsEl.innerHTML = `<div class="visitors-empty">Не удалось узнать визитёров: ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderVisitorsList(visitorsEl, visitors);
}

function renderVisitorsList(container, visitors) {
  container.innerHTML = "";
  const title = document.createElement("div");
  title.className = "visitors-title";
  title.textContent = visitors.length === 0
    ? "Здесь ещё никто из ваших подписок не был."
    : visitors.length === 1
      ? "Здесь был 1 человек:"
      : `Здесь были ${visitors.length} чел.:`;
  container.appendChild(title);
  if (visitors.length === 0) return;

  for (const v of visitors) {
    const row = document.createElement("div");
    row.className = "visitor-row";
    const name = document.createElement("span");
    name.className = "visitor-name";
    name.textContent = "@" + (v.username || "?");
    const meta = document.createElement("span");
    meta.className = "visitor-meta";
    const parts = [];
    if (v.channelName) parts.push("#" + v.channelName);
    if (v.lastVisitedAt) parts.push(formatRelative(v.lastVisitedAt));
    meta.textContent = parts.join(" · ");
    row.append(name, meta);
    container.appendChild(row);
  }
}

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

function formatRelative(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (diff < 60) return `${diff} сек назад`;
  const m = Math.round(diff / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} д назад`;
  return new Date(iso).toLocaleDateString();
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
  const memberGroups = channels.filter((c) => c.role === "member" && c.isGroup);
  const memberReadonly = channels.filter((c) => c.role === "member" && !c.isGroup);
  const postable = [...owned, ...memberGroups];

  if (postable.length === 0) {
    list.innerHTML = '<div class="channel-empty">Каналов пока нет. Создайте новый ниже.</div>';
  } else {
    const selected = new Set(cfg.autopostChannels || []);
    for (const c of postable) {
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
      if (c.isGroup) {
        const groupBadge = document.createElement("span");
        groupBadge.className = "channel-meta group";
        groupBadge.textContent = c.role === "owner" ? "группа" : "группа · участник";
        row.append(groupBadge);
      }

      if (c.role === "owner" && c.visibility === 1) {
        const manageBtn = document.createElement("button");
        manageBtn.type = "button";
        manageBtn.className = "inline secondary";
        manageBtn.textContent = openMemberPanels.has(c.id) ? "Скрыть" : "Участники";
        manageBtn.addEventListener("click", (e) => {
          e.preventDefault();
          if (openMemberPanels.has(c.id)) openMemberPanels.delete(c.id);
          else openMemberPanels.add(c.id);
          renderChannels(cfg);
        });
        row.append(manageBtn);
      }

      list.appendChild(row);

      if (c.role === "owner" && c.visibility === 1 && openMemberPanels.has(c.id)) {
        list.appendChild(renderMembersPanel(api, c, cfg));
      }
    }
  }

  if (memberReadonly.length === 0) {
    subList.innerHTML = '<div class="channel-empty">Подписок пока нет. Найдите каналы ниже.</div>';
  } else {
    for (const c of memberReadonly) {
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
    row.append(name, meta);
    if (c.isGroup) {
      const gb = document.createElement("span");
      gb.className = "channel-meta group";
      gb.textContent = "группа";
      row.append(gb);
    }
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
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function renderMembersPanel(api, channel, cfg) {
  const panel = document.createElement("div");
  panel.className = "members-panel";

  const list = document.createElement("div");
  list.className = "members-list";
  list.textContent = "Загрузка…";
  panel.appendChild(list);

  const addRow = document.createElement("div");
  addRow.className = "add-member-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "username";
  input.maxLength = 64;
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "inline";
  addBtn.textContent = "Добавить";
  addRow.append(input, addBtn);
  panel.appendChild(addRow);

  const err = document.createElement("div");
  err.className = "members-error";
  panel.appendChild(err);

  async function reload() {
    err.textContent = "";
    list.textContent = "Загрузка…";
    let members;
    try {
      members = await api.listMembers(channel.id);
    } catch (e) {
      list.innerHTML = "";
      err.textContent = `Ошибка загрузки: ${e.message}`;
      return;
    }
    list.innerHTML = "";
    if (members.length === 0) {
      const empty = document.createElement("div");
      empty.className = "member-empty";
      empty.textContent = "Никого ещё не добавили.";
      list.appendChild(empty);
      return;
    }
    for (const m of members) {
      const row = document.createElement("div");
      row.className = "member-row";
      const name = document.createElement("span");
      name.className = "member-name";
      name.textContent = "@" + m.username;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "inline secondary";
      rm.textContent = "Удалить";
      rm.addEventListener("click", async () => {
        rm.disabled = true;
        try {
          await api.removeMember(channel.id, m.userId);
          await reload();
        } catch (e) {
          rm.disabled = false;
          err.textContent = `Ошибка: ${e.message}`;
        }
      });
      row.append(name, rm);
      list.appendChild(row);
    }
  }

  addBtn.addEventListener("click", async () => {
    const username = input.value.trim();
    if (!username) return;
    addBtn.disabled = true;
    err.textContent = "";
    try {
      await api.addMember(channel.id, username);
      input.value = "";
      await reload();
    } catch (e) {
      err.textContent = e instanceof ApiError && e.status === 404
        ? "Пользователь не найден"
        : `Ошибка: ${e.message}`;
    } finally {
      addBtn.disabled = false;
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addBtn.click(); }
  });

  reload();
  return panel;
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

function bindVisibilityToggle() {
  const hint = $("vis-hint");
  const update = () => {
    const v = document.querySelector('input[name="new-channel-visibility"]:checked')?.value;
    hint.textContent = v === "0"
      ? "Публичный: виден в поиске, любой может подписаться и читать визиты."
      : "Приватный: только вы и приглашённые. Никто не найдёт через поиск.";
  };
  document.querySelectorAll('input[name="new-channel-visibility"]').forEach((r) => {
    r.addEventListener("change", update);
  });
  update();
}

function bindMain() {
  $("open-feed").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("feed.html") });
  });

  $("open-tools").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tools.html") });
  });

  $("open-chat").addEventListener("click", async () => {
    const channelId = $("chat-channel-select").value;
    if (!channelId) {
      flashStatus("Выберите канал для чата.", true);
      return;
    }
    const tab = await getActiveTab();
    if (!tab?.url || !/^https?:/i.test(tab.url)) {
      flashStatus("Нет активной http(s)-вкладки.", true);
      return;
    }
    const qs = new URLSearchParams({ channelId, url: tab.url });
    chrome.tabs.create({
      url: chrome.runtime.getURL("chat.html") + "?" + qs.toString()
    });
  });

  $("post-current-tab").addEventListener("click", async () => {
    const btn = $("post-current-tab");
    btn.disabled = true;
    try {
      const cfg = await getConfig(windowId);
      const selected = currentlyCheckedChannels();
      if (selected.length === 0) {
        flashStatus("Сначала отметьте хотя бы один канал галочкой.", true);
        return;
      }
      const tab = await getActiveTab();
      if (!tab?.url || !/^https?:/i.test(tab.url)) {
        flashStatus("Нет активной http(s)-вкладки.", true);
        return;
      }
      const api = new ApiClient(cfg.apiBase, cfg.apiToken);
      await api.postVisit(tab.url, tab.title ?? null, selected);
      flashStatus(`Отправлено в ${selected.length} канал(а/ов).`);
    } catch (e) {
      flashStatus(`Ошибка: ${e.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("global-login").addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    const cfg = await getConfig(windowId);
    await setGlobalLogin(enabled, {
      apiToken: cfg.apiToken,
      userId: cfg.userId,
      username: cfg.username,
    });
    flashStatus(enabled
      ? "Глобальный логин включён — другие окна будут логиниться сами."
      : "Глобальный логин выключен.");
  });

  $("logout").addEventListener("click", async () => {
    await clearAuth(windowId);
    showAuth();
  });

  $("save").addEventListener("click", async () => {
    const selected = currentlyCheckedChannels();
    const blacklist = $("blacklist").value
      .split("\n").map((l) => l.trim()).filter(Boolean);
    const whitelist = $("whitelist").value
      .split("\n").map((l) => l.trim()).filter(Boolean);
    await saveSettings(windowId, { autopostChannels: selected, blacklist, whitelist });
    flashStatus(`Сохранено: каналов — ${selected.length}, whitelist — ${whitelist.length}, blacklist — ${blacklist.length}`);
  });

  $("new-channel-create").addEventListener("click", async () => {
    const name = $("new-channel-name").value.trim();
    if (!name) return;
    const visRadio = document.querySelector('input[name="new-channel-visibility"]:checked');
    const visibility = Number(visRadio?.value ?? 1);
    const isGroup = $("new-channel-is-group").checked;
    const cfg = await getConfig(windowId);
    const api = new ApiClient(cfg.apiBase, cfg.apiToken);
    try {
      await api.createChannel(name, null, visibility, isGroup);
      $("new-channel-name").value = "";
      $("new-channel-is-group").checked = false;
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

function currentlyCheckedChannels() {
  const cbs = document.querySelectorAll(
    "#channel-list > .channel-item input[type=checkbox]"
  );
  return Array.from(cbs).filter((c) => c.checked).map((c) => c.value);
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
bindVisibilityToggle();
init();
