// CurrentUser — helper для доставания Guid пользователя из ClaimsPrincipal в эндпойнтах.
using System.Security.Claims;

namespace Api.Auth;

public static class CurrentUser
{
    public const string UserIdClaim = "uid";

    public static Guid GetId(ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(UserIdClaim)
            ?? throw new InvalidOperationException("User id claim missing");
        return Guid.Parse(value);
    }
}
