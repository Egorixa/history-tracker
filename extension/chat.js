import { ApiClient, ApiError } from "./api.js";
import { getConfig, getCurrentWindowId } from "./config.js";

const $ = (id) => document.getElementById(id);

const PAGE_SIZE = 100;

const params = new URLSearchParams(location.search);
let channelId = params.get("channelId");
const url = params.get("url");
const elementKey = params.get("elementKey") || null;
const elementLabel = params.get("elementLabel") || null;

let cfg = null;
let api = null;
let myUserId = null;

async function init() {
  if (!url) {
    showFatal("В адресе не хватает url.");
    return;
  }

  const windowId = await getCurrentWindowId();
  cfg = await getConfig(windowId);
  if (!cfg.apiToken) {
    $("auth-warning").classList.remove("hidden");
    return;
  }

  $("user-badge").textContent = "@" + (cfg.username || "вы");
  myUserId = cfg.userId;
  api = new ApiClient(cfg.apiBase, cfg.apiToken);

  if (!channelId) {
    await showChannelPicker();
    return;
  }

  await startChat();
}

async function showChannelPicker() {
  $("channel-picker").classList.remove("hidden");
  $("picker-url").textContent = url;
  if (elementKey) {
    $("picker-element").classList.remove("hidden");
    $("picker-element").textContent = elementLabel
      ? `Элемент: ${elementLabel}`
      : `Элемент: ${elementKey}`;
  }

  let my;
  try {
    my = await api.myChannels();
  } catch (e) {
    showFatal(`Не удалось загрузить каналы: ${e.message}`);
    return;
  }
  const postable = my.filter(
    (c) => c.role === "owner" || (c.role === "member" && c.isGroup)
  );
  const sel = $("picker-select");
  sel.innerHTML = "";
  if (postable.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет каналов, куда можно писать";
    sel.appendChild(opt);
    sel.disabled = true;
    $("picker-open").disabled = true;
    return;
  }
  for (const c of postable) {
    const opt = document.createElement("option");
    opt.value = c.id;
    const tag = c.role === "owner" ? "★" : "•";
    opt.textContent = `${tag} ${c.name}` + (c.isGroup ? " (группа)" : "");
    sel.appendChild(opt);
  }
  $("picker-open").addEventListener("click", async () => {
    channelId = sel.value;
    if (!channelId) return;
    $("channel-picker").classList.add("hidden");
    await startChat();
  });
}

async function startChat() {
  $("chat-section").classList.remove("hidden");
  $("chat-url").textContent = url;
  if (elementKey) {
    $("chat-element").classList.remove("hidden");
    $("chat-element").textContent = elementLabel
      ? `Элемент: ${elementLabel}`
      : `Элемент: ${elementKey}`;
    $("chat-title").textContent = "Обсуждение элемента";
  } else {
    $("chat-title").textContent = "Обсуждение страницы";
  }

  await renderChannelLabel();
  await reload();
  bindComposer();
}

async function renderChannelLabel() {
  try {
    const my = await api.myChannels();
    const ch = my.find((c) => c.id === channelId);
    if (ch) $("chat-channel").textContent = `Канал #${ch.name}`;
  } catch {
  }
}

async function reload() {
  const list = $("messages");
  list.innerHTML = '<div class="messages-empty">Загрузка…</div>';
  let data;
  try {
    data = await api.getSiteMessages(channelId, {
      url,
      elementKey,
      limit: PAGE_SIZE
    });
  } catch (e) {
    list.innerHTML = "";
    flashStatus(`Не удалось загрузить: ${e.message}`, true);
    return;
  }
  const msgs = (data?.messages || []).slice().reverse();
  renderMessages(msgs);
}

function renderMessages(messages) {
  const list = $("messages");
  list.innerHTML = "";
  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "messages-empty";
    empty.textContent = elementKey
      ? "Здесь ещё никто не обсуждал этот элемент. Начните первым."
      : "Здесь ещё никто не писал. Начните первым.";
    list.appendChild(empty);
    return;
  }
  for (const m of messages) {
    list.appendChild(renderMessage(m));
  }
  list.scrollTop = list.scrollHeight;
}

function renderMessage(m) {
  const el = document.createElement("div");
  el.className = "msg" + (m.authorId === myUserId ? " mine" : "");
  const head = document.createElement("div");
  head.className = "msg-head";
  const author = document.createElement("span");
  author.className = "msg-author";
  author.textContent = "@" + m.authorUsername;
  const at = document.createElement("span");
  at.textContent = formatTime(m.createdAt);
  head.append(author, at);
  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = m.body;
  el.append(head, body);
  return el;
}

function bindComposer() {
  const ta = $("msg-body");
  $("msg-send").addEventListener("click", send);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

async function send() {
  const ta = $("msg-body");
  const body = ta.value.trim();
  if (!body) return;
  $("msg-send").disabled = true;
  try {
    await api.postSiteMessage(channelId, {
      url,
      elementKey,
      elementLabel,
      body
    });
    ta.value = "";
    await reload();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      flashStatus("Писать в этот канал нельзя — вы не участник.", true);
    } else {
      flashStatus(`Ошибка: ${e.message}`, true);
    }
  } finally {
    $("msg-send").disabled = false;
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString();
}

function showFatal(msg) {
  $("chat-section").classList.add("hidden");
  const warn = $("auth-warning");
  warn.classList.remove("hidden");
  warn.querySelector("p").textContent = msg;
}

function flashStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#c23a3a" : "#3f8a3a";
  if (!isError) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

init();
