export class ApiClient {
  constructor(apiBase, apiToken) {
    this.apiBase = apiBase.replace(/\/+$/, "");
    this.apiToken = apiToken;
  }

  async _fetch(path, init = {}) {
    const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
    if (this.apiToken) headers["Authorization"] = `Bearer ${this.apiToken}`;
    const resp = await fetch(`${this.apiBase}${path}`, { ...init, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new ApiError(resp.status, text || resp.statusText);
    }
    if (resp.status === 204) return null;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) return resp.json();
    return resp.text();
  }

  register(username, password) {
    return this._fetch("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  }

  login(username, password) {
    return this._fetch("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  }

  myChannels() {
    return this._fetch("/api/v1/channels/my");
  }

  publicChannels(query) {
    const q = query ? `?query=${encodeURIComponent(query)}` : "";
    return this._fetch(`/api/v1/channels/public${q}`);
  }

  createChannel(name, description, visibility, isGroup = false) {
    return this._fetch("/api/v1/channels", {
      method: "POST",
      body: JSON.stringify({ name, description, visibility, isGroup })
    });
  }

  subscribe(channelId) {
    return this._fetch(`/api/v1/channels/${channelId}/subscribe`, { method: "POST" });
  }

  unsubscribe(channelId, userId) {
    return this._fetch(`/api/v1/channels/${channelId}/members/${userId}`, { method: "DELETE" });
  }

  listMembers(channelId) {
    return this._fetch(`/api/v1/channels/${channelId}/members`);
  }

  addMember(channelId, username) {
    return this._fetch(`/api/v1/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ username })
    });
  }

  removeMember(channelId, userId) {
    return this._fetch(`/api/v1/channels/${channelId}/members/${userId}`, { method: "DELETE" });
  }

  postVisit(url, title, channelIds) {
    return this._fetch("/api/v1/visits", {
      method: "POST",
      body: JSON.stringify({ url, title, channelIds })
    });
  }

  listVisits(channelId, { limit, before } = {}) {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (before) qs.set("before", before);
    const tail = qs.toString() ? `?${qs}` : "";
    return this._fetch(`/api/v1/channels/${channelId}/visits${tail}`);
  }

  listPosts(channelId, { limit, before } = {}) {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (before) qs.set("before", before);
    const tail = qs.toString() ? `?${qs}` : "";
    return this._fetch(`/api/v1/channels/${channelId}/posts${tail}`);
  }

  createPost(channelId, body) {
    return this._fetch(`/api/v1/channels/${channelId}/posts`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }

  lookup(urls) {
    return this._fetch("/api/v1/lookup/by-url", {
      method: "POST",
      body: JSON.stringify({ urls })
    });
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}
