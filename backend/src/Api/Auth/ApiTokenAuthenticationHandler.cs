// ApiTokenAuthenticationHandler — кастомная схема аутентификации: читает заголовок
// Authorization: Bearer <token>, ищет в таблице users и кладёт uid-claim в принципала.
using System.Security.Claims;
using System.Text.Encodings.Web;
using Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Api.Auth;

public class ApiTokenOptions : AuthenticationSchemeOptions
{
    public const string Scheme = "ApiToken";
}

public class ApiTokenAuthenticationHandler : AuthenticationHandler<ApiTokenOptions>
{
    private readonly AppDbContext _db;

    public ApiTokenAuthenticationHandler(
        IOptionsMonitor<ApiTokenOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        AppDbContext db) : base(options, logger, encoder)
    {
        _db = db;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var authHeader))
            return AuthenticateResult.NoResult();

        var header = authHeader.ToString();
        const string prefix = "Bearer ";
        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var token = header[prefix.Length..].Trim();
        if (string.IsNullOrEmpty(token))
            return AuthenticateResult.Fail("Empty token");

        var user = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.ApiToken == token);
        if (user is null)
            return AuthenticateResult.Fail("Invalid token");

        var claims = new[]
        {
            new Claim(CurrentUser.UserIdClaim, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username)
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);
        return AuthenticateResult.Success(ticket);
    }
}
