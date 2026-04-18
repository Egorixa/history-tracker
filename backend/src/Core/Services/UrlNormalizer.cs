// UrlNormalizer — приводит URL к каноничной форме (lower-case host, strip utm/fbclid,
// сортировка query-параметров, trim trailing slash) и считает SHA-256 от результата.
// Без нормализации «a.com/x?utm=1» и «A.com/x» считались бы разными URL.
using System.Security.Cryptography;
using System.Text;

namespace Core.Services;

public static class UrlNormalizer
{
    private static readonly string[] TrackingParamPrefixes =
    {
        "utm_", "fbclid", "gclid", "yclid", "mc_eid", "mc_cid", "_ga", "ref", "ref_src"
    };

    public static bool TryNormalize(string? input, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(input)) return false;

        if (!Uri.TryCreate(input, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;

        var host = uri.Host.ToLowerInvariant();
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
            var kept = new List<string>();
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                var key = eq >= 0 ? part[..eq] : part;
                if (IsTrackingParam(key)) continue;
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
