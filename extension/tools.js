import { ApiClient, ApiError } from "./api.js";
import { getConfig, getCurrentWindowId, DEFAULT_BLACKLIST } from "./config.js";

const $ = (id) => document.getElementById(id);

const IMPORT_THROTTLE_MS = 80;
const VISITS_PAGE_SIZE = 200;
const VISITS_MAX_PAGES = 500;
const MAX_JSON_BYTES = 50 * 1024 * 1024;

let cfg = null;
let api = null;
let channels = [];
let importStopFlag = false;

const importState = { entries: null };
const diffState = { entries: null };

async function init() {
  const windowId = await getCurrentWindowId();
  cfg = await getConfig(windowId);
  if (!cfg.apiToken) {
    $("auth-warning").classList.remove("hidden");
    return;
  }
  $("tools-section").classList.remove("hidden");
  $("user-badge").textContent = "@" + (cfg.username || "вы");
  api = new ApiClient(cfg.apiBase, cfg.apiToken);

  try {
    channels = await api.myChannels();
  } catch (e) {
    flashStatus(`Не удалось загрузить каналы: ${e.message}`, true);
    return;
  }
  renderImportChannels();
  renderDiffChannelSelect();
  bindImport();
  bindDiff();
}

function renderImportChannels() {
  const root = $("import-channels");
  root.innerHTML = "";
  const postable = channels.filter(
    (c) => c.role === "owner" || (c.role === "member" && c.isGroup)
  );
  if (postable.length === 0) {
    root.innerHTML = '<div class="channel-empty">Нет каналов, куда можно постить.</div>';
    return;
  }
  for (const c of postable) {
    const row = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = c.id;
    cb.dataset.channelId = c.id;
    const name = document.createElement("span");
    name.textContent = c.name + (c.isGroup ? " (группа)" : "");
    row.append(cb, name);
    root.appendChild(row);
  }
}

function bindImport() {
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const entries = await readEntries(file);
      const filtered = filterByLists(entries, cfg.whitelist, cfg.blacklist);
      importState.entries = filtered;
      const skipped = entries.length - filtered.length;
      $("import-summary").textContent =
        `Распознано записей: ${entries.length}. ` +
        `После white/blacklist: ${filtered.length}` +
        (skipped > 0 ? ` (отброшено ${skipped}).` : ".");
      $("import-start").disabled = filtered.length === 0;
    } catch (err) {
      importState.entries = null;
      $("import-summary").textContent = `Не удалось разобрать файл: ${err.message}`;
      $("import-start").disabled = true;
    }
  });

  $("import-start").addEventListener("click", runImport);

  $("import-stop").addEventListener("click", () => {
    importStopFlag = true;
  });
}

async function runImport() {
  if (!importState.entries || importState.entries.length === 0) return;
  const selected = Array.from(
    document.querySelectorAll('#import-channels input[type=checkbox]:checked')
  ).map((c) => c.value);
  if (selected.length === 0) {
    flashStatus("Отметьте хотя бы один канал.", true);
    return;
  }

  importStopFlag = false;
  $("import-start").disabled = true;
  $("import-stop").classList.remove("hidden");
  $("import-progress").classList.remove("hidden");

  const total = importState.entries.length;
  let done = 0;
  let ok = 0;
  let failed = 0;

  for (const entry of importState.entries) {
    if (importStopFlag) break;
    try {
      await api.postVisit(entry.url, entry.title ?? null, selected);
      ok++;
    } catch (e) {
      failed++;
      console.warn("[tools] postVisit failed", entry.url, e);
    }
    done++;
    updateImportProgress(done, total, ok, failed);
    if (IMPORT_THROTTLE_MS > 0) await sleep(IMPORT_THROTTLE_MS);
  }

  $("import-stop").classList.add("hidden");
  $("import-start").disabled = false;
  flashStatus(
    importStopFlag
      ? `Остановлено. Отправлено ${ok}, ошибок ${failed}.`
      : `Готово. Отправлено ${ok}, ошибок ${failed}.`
  );
}

function updateImportProgress(done, total, ok, failed) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  $("import-bar").style.width = pct + "%";
  $("import-status").textContent =
    `${done} / ${total} (${pct}%) · успешно ${ok}, ошибок ${failed}`;
}

function renderDiffChannelSelect() {
  const sel = $("diff-channel");
  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— выберите канал —";
  sel.appendChild(placeholder);
  for (const c of channels) {
    const opt = document.createElement("option");
    opt.value = c.id;
    const tag = c.role === "owner" ? "★" : "•";
    opt.textContent = `${tag} ${c.name}`;
    sel.appendChild(opt);
  }
}

function bindDiff() {
  $("diff-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const entries = await readEntries(file);
      diffState.entries = entries;
      updateDiffStartState();
    } catch (err) {
      diffState.entries = null;
      flashStatus(`Не удалось разобрать файл: ${err.message}`, true);
      updateDiffStartState();
    }
  });
  $("diff-channel").addEventListener("change", updateDiffStartState);
  $("diff-start").addEventListener("click", runDiff);
}

function updateDiffStartState() {
  $("diff-start").disabled = !(diffState.entries && $("diff-channel").value);
}

async function runDiff() {
  const channelId = $("diff-channel").value;
  if (!channelId || !diffState.entries) return;

  $("diff-start").disabled = true;
  $("diff-progress").classList.remove("hidden");
  $("diff-result").classList.add("hidden");
  $("diff-status").textContent = "Загружаем визиты канала…";

  const historyByNorm = new Map();
  for (const e of diffState.entries) {
    const norm = htNormalizeUrl(e.url);
    if (!norm) continue;
    if (!historyByNorm.has(norm)) historyByNorm.set(norm, e.url);
  }

  let channelByNorm;
  try {
    channelByNorm = await fetchAllChannelVisits(channelId, (loaded) => {
      $("diff-status").textContent = `Загружено визитов канала: ${loaded}`;
    });
  } catch (e) {
    flashStatus(`Не удалось выгрузить визиты: ${e.message}`, true);
    $("diff-start").disabled = false;
    return;
  }

  const both = [];
  const onlyHistory = [];
  const onlyChannel = [];

  for (const [norm, raw] of historyByNorm) {
    if (channelByNorm.has(norm)) both.push(raw);
    else onlyHistory.push(raw);
  }
  for (const [norm, raw] of channelByNorm) {
    if (!historyByNorm.has(norm)) onlyChannel.push(raw);
  }

  renderDiffList("diff-list-both", "diff-count-both", both);
  renderDiffList("diff-list-only-history", "diff-count-only-history", onlyHistory);
  renderDiffList("diff-list-only-channel", "diff-count-only-channel", onlyChannel);
  $("diff-result").classList.remove("hidden");
  $("diff-status").textContent =
    `История: ${historyByNorm.size} уникальных URL, в канале: ${channelByNorm.size}.`;
  $("diff-start").disabled = false;
}

async function fetchAllChannelVisits(channelId, onProgress) {
  const seen = new Map();
  let before = undefined;
  for (let page = 0; page < VISITS_MAX_PAGES; page++) {
    const items = await api.listVisits(channelId, { limit: VISITS_PAGE_SIZE, before });
    if (!Array.isArray(items) || items.length === 0) break;
    for (const v of items) {
      const norm = htNormalizeUrl(v.url);
      if (!norm) continue;
      if (!seen.has(norm)) seen.set(norm, v.url);
    }
    onProgress?.(seen.size);
    if (items.length < VISITS_PAGE_SIZE) break;
    before = items[items.length - 1].visitedAt;
    if (!before) break;
  }
  return seen;
}

function renderDiffList(listId, countId, items) {
  $(countId).textContent = String(items.length);
  const list = $(listId);
  list.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent = "—";
    list.appendChild(empty);
    return;
  }
  const RENDER_LIMIT = 500;
  const slice = items.slice(0, RENDER_LIMIT);
  for (const url of slice) {
    const row = document.createElement("div");
    row.className = "diff-item";
    row.textContent = url;
    row.title = url;
    list.appendChild(row);
  }
  if (items.length > RENDER_LIMIT) {
    const more = document.createElement("div");
    more.className = "diff-empty";
    more.textContent = `…и ещё ${items.length - RENDER_LIMIT} (показаны только первые ${RENDER_LIMIT})`;
    list.appendChild(more);
  }
}

async function readEntries(file) {
  if (file.size > MAX_JSON_BYTES) {
    throw new Error(`Файл слишком большой (${Math.round(file.size / 1024 / 1024)} МБ).`);
  }
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Файл не парсится как JSON");
  }
  let arr = data;
  if (!Array.isArray(arr)) {
    arr = data?.items || data?.history || data?.urls || null;
  }
  if (!Array.isArray(arr)) {
    throw new Error("Ожидался массив записей или { items: [...] }");
  }
  const out = [];
  for (const raw of arr) {
    if (typeof raw === "string") {
      if (/^https?:\/\//i.test(raw)) out.push({ url: raw, title: null });
    } else if (raw && typeof raw === "object") {
      const url = raw.url || raw.URL || raw.link;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        out.push({ url, title: raw.title ?? null });
      }
    }
  }
  if (out.length === 0) {
    throw new Error("В файле не нашлось ни одного http(s)-URL");
  }
  return out;
}

function filterByLists(entries, whitelist, blacklist) {
  const out = [];
  for (const e of entries) {
    if (isAllowed(e.url, whitelist, blacklist)) out.push(e);
  }
  return out;
}

function isAllowed(url, whitelist, blacklist) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.host.toLowerCase();
    const full = host + u.pathname;
    if (whitelist && whitelist.length > 0 && !matchesRules(host, full, whitelist)) return false;
    if (matchesRules(host, full, blacklist || DEFAULT_BLACKLIST)) return false;
    return true;
  } catch {
    return false;
  }
}

function matchesRules(host, full, rules) {
  return rules.some((rule) => {
    const r = rule.toLowerCase();
    return host === r || host.endsWith("." + r) || full.startsWith(r);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function flashStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#c23a3a" : "#3f8a3a";
  if (!isError) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

init();
