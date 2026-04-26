using System.Security.Cryptography;
using System.Text;

namespace Core.Services;

public static class UrlNormalizer
{
    private static readonly string[] TrackingParamPrefixes =
    {
        "utm_", "fbclid", "gclid", "yclid", "mc_eid", "mc_cid", "_ga", "ref", "ref_src"
    };

    private static readonly Dictionary<string, Dictionary<string, HashSet<string>>> SiteAllowlist =
        new()
        {

            ["youtube.com"] = new()
            {
                ["/watch"] = new(StringComparer.Ordinal) { "v" },
                ["/playlist"] = new(StringComparer.Ordinal) { "list" },
                ["/results"] = new(StringComparer.Ordinal) { "search_query" }
            },
            ["m.youtube.com"] = new()
            {
                ["/watch"] = new(StringComparer.Ordinal) { "v" }
            },
            ["music.youtube.com"] = new()
            {
                ["/watch"] = new(StringComparer.Ordinal) { "v" },
                ["/playlist"] = new(StringComparer.Ordinal) { "list" }
            },
            ["google.com"] = new()
            {
                ["/search"] = new(StringComparer.Ordinal) { "q" }
            },

            ["youtu.be"] = new()
            {
                ["*"] = new(StringComparer.Ordinal)
            }
        };

    private static HashSet<string>? AllowedQueryKeys(string host, string path)
    {
        if (SiteAllowlist.TryGetValue(host, out var byPath))
        {
            if (byPath.TryGetValue(path, out var keys)) return keys;
            if (byPath.TryGetValue("*", out var wildcard)) return wildcard;
        }

        if (host.EndsWith(".google.com") || host.StartsWith("google.") || host.Contains(".google."))
        {
            if (path == "/search") return new HashSet<string>(StringComparer.Ordinal) { "q" };
        }
        return null;
    }

    public static bool TryNormalize(string? input, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(input)) return false;

        if (!Uri.TryCreate(input, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;

        var host = uri.Host.ToLowerInvariant();

        if (host.StartsWith("www.") && host[4..].Contains('.')) host = host[4..];
        var isDefault = (uri.Scheme == Uri.UriSchemeHttp && uri.Port == 80) ||
                        (uri.Scheme == Uri.UriSchemeHttps && uri.Port == 443);

        var sb = new StringBuilder();
        sb.Append(uri.Scheme).Append("://").Append(host);
        if (!isDefault) sb.Append(':').Append(uri.Port);

        var path = uri.AbsolutePath.TrimEnd('/');
        if (path.Length > 0) sb.Append(path);

        var query = uri.Query.TrimStart('?');
        if (query.Length > 0)
        {
            var allow = AllowedQueryKeys(host, path.Length == 0 ? "/" : path);
            var kept = new List<string>();
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                var key = eq >= 0 ? part[..eq] : part;
                if (allow is not null)
                {
                    if (!allow.Contains(key)) continue;
                }
                else
                {
                    if (IsTrackingParam(key)) continue;
                }
                kept.Add(part);
            }
            if (kept.Count > 0)
            {
                kept.Sort(StringComparer.Ordinal);
                sb.Append('?').Append(string.Join('&', kept));
            }
        }

        normalized = sb.ToString();
        return true;
    }

    public static byte[] Hash(string normalizedUrl)
    {
        return SHA256.HashData(Encoding.UTF8.GetBytes(normalizedUrl));
    }

    private static bool IsTrackingParam(string key)
    {
        foreach (var prefix in TrackingParamPrefixes)
        {
            if (key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
