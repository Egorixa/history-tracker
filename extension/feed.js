import { ApiClient, ApiError } from "./api.js";
import { getConfig, getCurrentWindowId } from "./config.js";

const $ = (id) => document.getElementById(id);

let cfg = null;
let api = null;
let channels = [];
let currentChannelId = null;
let currentFilter = "all";
let lastItems = [];

async function init() {
  const windowId = await getCurrentWindowId();
  cfg = await getConfig(windowId);

  if (!cfg.apiToken) {
    $("auth-warning").classList.remove("hidden");
    $("feed-section").classList.add("hidden");
    return;
  }

  $("user-badge").textContent = "@" + (cfg.username || "вы");
  api = new ApiClient(cfg.apiBase, cfg.apiToken);

  try {
    channels = await api.myChannels();
  } catch (e) {
    showError(`Не удалось загрузить каналы: ${e.message}`);
    return;
  }

  if (channels.length === 0) {
    $("feed-list").innerHTML = '<div class="feed-empty">Нет ни одного канала. Создайте или подпишитесь через всплывающее окно.</div>';
    return;
  }

  const sel = $("channel-select");
  sel.innerHTML = "";
  for (const c of channels) {
    const opt = document.createElement("option");
    opt.value = c.id;
    const tag = c.role === "owner" ? "★" : "•";
    opt.textContent = `${tag} ${c.name}`;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => selectChannel(sel.value));

  bindComposer();
  bindRefresh();
  bindFilters();

  await selectChannel(channels[0].id);
}

async function selectChannel(channelId) {
  currentChannelId = channelId;
  const ch = channels.find((c) => c.id === channelId);
  const canPost = ch && (ch.role === "owner" || ch.role === "member");
  $("composer").classList.toggle("hidden", !canPost);
  if (canPost) {
    $("composer-hint").textContent = ch.role === "owner"
      ? "Вы владелец канала."
      : "Вы подписаны на канал.";
  }
  await renderFeed();
}

async function renderFeed() {
  const list = $("feed-list");
  list.innerHTML = '<div class="feed-empty">Загрузка…</div>';
  let posts = [];
  let visits = [];
  try {
    [posts, visits] = await Promise.all([
      api.listPosts(currentChannelId, { limit: 100 }),
      api.listVisits(currentChannelId, { limit: 100 })
    ]);
  } catch (e) {
    list.innerHTML = `<div class="feed-empty error">${escapeHtml(e.message)}</div>`;
    return;
  }

  lastItems = [
    ...posts.map((p) => ({ kind: "post", at: p.createdAt, data: p })),
    ...visits.map((v) => ({ kind: "visit", at: v.visitedAt, data: v }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  applyFilter();
}

function applyFilter() {
  const list = $("feed-list");
  const filtered = currentFilter === "all"
    ? lastItems
    : lastItems.filter((it) => it.kind === currentFilter);

  if (filtered.length === 0) {
    const msg = currentFilter === "post" ? "В этом канале пока нет постов."
      : currentFilter === "visit" ? "В этом канале пока нет визитов."
      : "В этом канале пока пусто.";
    list.innerHTML = `<div class="feed-empty">${msg}</div>`;
    return;
  }

  list.innerHTML = "";
  for (const it of filtered) {
    list.appendChild(renderItem(it));
  }
}

function bindFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      applyFilter();
    });
  });
}

function renderItem(it) {
  const wrap = document.createElement("div");
  wrap.className = `feed-item kind-${it.kind}`;

  const meta = document.createElement("div");
  meta.className = "feed-meta";
  const left = document.createElement("span");
  const author = it.kind === "post" ? it.data.authorUsername : it.data.userUsername;
  left.innerHTML = `<span class="author">@${escapeHtml(author || "?")}</span><span class="kind ${it.kind}">${it.kind === "post" ? "пост" : "визит"}</span>`;
  const right = document.createElement("span");
  right.textContent = formatDate(it.at);
  meta.append(left, right);
  wrap.appendChild(meta);

  const body = document.createElement("div");
  body.className = "feed-body";
  if (it.kind === "post") {
    body.textContent = it.data.body;
  } else {
    if (it.data.title) {
      const t = document.createElement("div");
      t.className = "feed-title";
      t.textContent = it.data.title;
      body.appendChild(t);
    }
    const a = document.createElement("a");
    a.href = it.data.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "feed-url";
    a.textContent = it.data.url;
    body.appendChild(a);
  }
  wrap.appendChild(body);
  return wrap;
}

function bindComposer() {
  $("post-submit").addEventListener("click", async () => {
    const body = $("post-body").value.trim();
    if (!body) return;
    const btn = $("post-submit");
    btn.disabled = true;
    try {
      await api.createPost(currentChannelId, body);
      $("post-body").value = "";
      flashStatus("Пост опубликован.");
      await renderFeed();
    } catch (e) {
      flashStatus(e instanceof ApiError && e.status === 403
        ? "Нет прав на публикацию в этом канале."
        : `Ошибка: ${e.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });
}

function bindRefresh() {
  $("refresh").addEventListener("click", () => renderFeed());
}

function flashStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  setTimeout(() => { el.textContent = ""; }, 3000);
}

function showError(msg) {
  $("feed-list").innerHTML = `<div class="feed-empty error">${escapeHtml(msg)}</div>`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

init();
