(() => {
  const BATCH_SIZE = 50;
  const BATCH_DEBOUNCE_MS = 500;
  const MAX_TOOLTIP = 5;
  const MAX_BADGE_AVATARS = 3;

  const DEBUG = (() => { try { return localStorage.getItem("htDebug") === "1"; } catch { return false; } })();
  const dlog = (...args) => DEBUG && console.log("[ht]", ...args);

  const cache = new Map();

  const pending = new Map();
  let scheduled = null;
  let activeTooltip = null;

  const normalize = globalThis.htNormalizeUrl;

  function isHttp(href) {
    return href && (href.startsWith("http://") || href.startsWith("https://"));
  }

  function initials(name) {
    const n = (name || "?").trim();
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function relativeTime(iso) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diffSec = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (diffSec < 60) return `${diffSec} сек назад`;
    const m = Math.round(diffSec / 60);
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} д назад`;
    return new Date(iso).toLocaleDateString();
  }

  function scheduleBatch() {
    if (scheduled) return;
    scheduled = setTimeout(async () => {
      scheduled = null;
      const norms = Array.from(pending.keys()).slice(0, BATCH_SIZE);
      if (norms.length === 0) return;
      const rawUrls = norms.map((n) => pending.get(n).rawUrl);

      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: "lookup", urls: rawUrls });
      } catch {

        for (const n of norms) pending.delete(n);
        return;
      }
      if (!response || !response.ok) {
        for (const n of norms) pending.delete(n);
        return;
      }

      const result = response.result || {};
      let hits = 0;
      for (const n of norms) {
        const entry = pending.get(n);
        if (!entry) continue;
        const visitors = result[entry.rawUrl] || [];
        cache.set(n, visitors);
        pending.delete(n);
        if (visitors.length > 0) {
          hits++;
          for (const a of entry.anchors) decorate(a, visitors);
        }
      }
      dlog(`lookup batch: sent=${norms.length}, with_visitors=${hits}`);
      if (pending.size > 0) scheduleBatch();
    }, BATCH_DEBOUNCE_MS);
  }

  function enqueue(anchor, norm) {
    const existing = pending.get(norm);
    if (existing) {
      existing.anchors.add(anchor);
      return;
    }
    pending.set(norm, { rawUrl: anchor.href, anchors: new Set([anchor]) });
    scheduleBatch();
  }

  function buildChatIcon(anchor) {
    const icon = document.createElement("span");
    icon.className = "ht-chat-icon";
    icon.textContent = "💬";
    icon.title = "Обсудить эту ссылку в одном из ваших каналов";
    icon.setAttribute("role", "button");
    icon.setAttribute("aria-label", "Обсудить эту ссылку");
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.href;
      if (!isHttp(href)) return;
      const label = (anchor.textContent || "").trim().slice(0, 80) || href;
      const norm = normalize(href) || href;
      const elementKey = "link:" + norm;
      chrome.runtime.sendMessage({
        type: "openChat",
        url: href,
        elementKey,
        elementLabel: label
      });
    });
    return icon;
  }

  function buildBadge(visitors) {
    const badge = document.createElement("span");
    badge.className = "ht-badge";
    badge.setAttribute("aria-label", `${visitors.length} из ваших друзей посетили ссылку`);

    const avatarsToShow = visitors.slice(0, MAX_BADGE_AVATARS);
    for (const v of avatarsToShow) {
      const av = document.createElement("span");
      av.className = "ht-badge-av";
      av.textContent = initials(v.username);
      badge.appendChild(av);
    }

    const count = document.createElement("span");
    count.className = "ht-badge-count";
    count.textContent = visitors.length > MAX_BADGE_AVATARS
      ? `+${visitors.length - MAX_BADGE_AVATARS}`
      : String(visitors.length);
    badge.appendChild(count);

    return badge;
  }

  function decorate(link, visitors) {
    if (link.dataset.htVisitors === "true") return;
    link.dataset.htVisitors = "true";
    link.classList.add("ht-seen");

    const badge = buildBadge(visitors);
    link.insertAdjacentElement("afterend", badge);

    const chatIcon = buildChatIcon(link);
    badge.insertAdjacentElement("afterend", chatIcon);

    attachHover(link, visitors);
    attachHover(badge, visitors);
  }

  function attachHover(el, visitors) {
    el.addEventListener("mouseenter", () => showTooltip(el, visitors));
    el.addEventListener("mouseleave", hideTooltip);
  }

  function hideTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(anchor, visitors) {
    hideTooltip();
    const el = document.createElement("div");
    el.className = "ht-tooltip";

    const header = document.createElement("div");
    header.className = "ht-tooltip-header";
    header.textContent = visitors.length === 1
      ? "1 посетитель из ваших каналов"
      : `${visitors.length} посетителей из ваших каналов`;
    el.appendChild(header);

    visitors.slice(0, MAX_TOOLTIP).forEach((v) => {
      const chip = document.createElement("div");
      chip.className = "ht-chip";

      const avatar = document.createElement("div");
      avatar.className = "ht-avatar";
      avatar.textContent = initials(v.username);

      const label = document.createElement("div");
      label.className = "ht-label";
      const name = document.createElement("div");
      name.className = "ht-name";
      name.textContent = v.username || "?";
      const meta = document.createElement("div");
      meta.className = "ht-meta";
      const channel = v.channelName ? `#${v.channelName}` : "";
      const when = v.lastVisitedAt ? relativeTime(v.lastVisitedAt) : "";
      meta.textContent = [channel, when].filter(Boolean).join(" · ");
      label.append(name, meta);

      chip.append(avatar, label);
      el.append(chip);
    });

    if (visitors.length > MAX_TOOLTIP) {
      const more = document.createElement("div");
      more.className = "ht-more";
      more.textContent = `и ещё ${visitors.length - MAX_TOOLTIP}…`;
      el.appendChild(more);
    }

    document.body.appendChild(el);
    const rect = anchor.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    const topPos = rect.top - tipRect.height - 8;
    el.style.top = (topPos > 4 ? topPos : rect.bottom + 8) + window.scrollY + "px";
    const maxLeft = window.innerWidth - tipRect.width - 4;
    const leftPos = Math.min(Math.max(4, rect.left), Math.max(4, maxLeft));
    el.style.left = leftPos + window.scrollX + "px";
    activeTooltip = el;
  }

  function scan(root) {
    if (typeof normalize !== "function") return;
    const anchors = (root || document).querySelectorAll("a[href]");
    anchors.forEach((a) => {
      if (a.dataset.htVisitors === "true") return;
      const href = a.href;
      if (!isHttp(href)) return;
      const norm = normalize(href);
      if (!norm) return;
      if (cache.has(norm)) {
        const visitors = cache.get(norm);
        if (visitors && visitors.length > 0) decorate(a, visitors);
        return;
      }
      enqueue(a, norm);
    });
  }

  chrome.runtime.sendMessage({ type: "ping" }, (resp) => {
    if (!resp?.ok) {
      dlog("ping failed — нет токена в этом окне, content-script стоит на месте");
      return;
    }
    if (typeof normalize !== "function") {
      console.warn("[ht] htNormalizeUrl не загружен — проверь, что url_normalizer.js идёт перед content.js в manifest.content_scripts.js");
      return;
    }
    dlog("ready, нормализатор подключен, запускаю первый скан");
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) scan(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
