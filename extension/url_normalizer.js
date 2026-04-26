(() => {
  const TRACKING_PREFIXES = [
    "utm_", "fbclid", "gclid", "yclid", "mc_eid", "mc_cid", "_ga", "ref", "ref_src"
  ];

  const SITE_ALLOWLIST = {
    "youtube.com": { "/watch": ["v"], "/playlist": ["list"], "/results": ["search_query"] },
    "m.youtube.com": { "/watch": ["v"] },
    "music.youtube.com": { "/watch": ["v"], "/playlist": ["list"] },
    "google.com": { "/search": ["q"] },
    "youtu.be": { "*": [] }
  };

  function isTracking(key) {
    const lower = key.toLowerCase();
    for (const p of TRACKING_PREFIXES) if (lower.startsWith(p)) return true;
    return false;
  }

  function allowedQueryKeys(host, path) {
    const byPath = SITE_ALLOWLIST[host];
    if (byPath) {
      if (byPath[path]) return new Set(byPath[path]);
      if (byPath["*"]) return new Set(byPath["*"]);
    }
    if (host.endsWith(".google.com") || host.startsWith("google.") || host.includes(".google.")) {
      if (path === "/search") return new Set(["q"]);
    }
    return null;
  }

  function normalizeUrl(input) {
    if (typeof input !== "string" || !input) return null;
    let u;
    try { u = new URL(input); } catch { return null; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.") && host.slice(4).includes(".")) host = host.slice(4);

    const isDefaultPort =
      (u.protocol === "http:" && (u.port === "" || u.port === "80")) ||
      (u.protocol === "https:" && (u.port === "" || u.port === "443"));

    let out = `${u.protocol}//${host}`;
    if (!isDefaultPort) out += `:${u.port}`;

    let path = u.pathname || "";
    if (path.endsWith("/") && path.length > 1) path = path.slice(0, -1);
    if (path === "/") path = "";
    out += path;

    const rawQuery = u.search.startsWith("?") ? u.search.slice(1) : u.search;
    if (rawQuery) {
      const allow = allowedQueryKeys(host, path === "" ? "/" : path);
      const kept = [];
      for (const part of rawQuery.split("&")) {
        if (!part) continue;
        const eq = part.indexOf("=");
        const key = eq >= 0 ? part.slice(0, eq) : part;
        if (allow !== null) {
          if (!allow.has(key)) continue;
        } else {
          if (isTracking(key)) continue;
        }
        kept.push(part);
      }
      if (kept.length > 0) {
        kept.sort();
        out += "?" + kept.join("&");
      }
    }

    return out;
  }

  globalThis.htNormalizeUrl = normalizeUrl;
})();
