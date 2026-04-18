// TokenGenerator — 32 байта из RandomNumberGenerator в base64url.
// Достаточно энтропии, чтобы не перебирался, и безопасно для URL/заголовков.
using System.Security.Cryptography;

namespace Api.Auth;

public static class TokenGenerator
{
    public static string NewToken()
    {
        Span<byte> buffer = stackalloc byte[32];
        RandomNumberGenerator.Fill(buffer);
        return Convert.ToBase64String(buffer)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }
}
