using Api.Auth;
using Api.Dtos;
using Core.Entities;
using Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth").WithTags("Auth");

        group.MapPost("/register", [Microsoft.AspNetCore.Authorization.AllowAnonymous] async (RegisterRequest req, AppDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username) || req.Username.Length is < 3 or > 64)
                return Results.BadRequest(new { error = "Username must be 3..64 chars" });
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 6)
                return Results.BadRequest(new { error = "Password must be at least 6 chars" });

            if (await db.Users.AnyAsync(u => u.Username == req.Username, ct))
                return Results.Conflict(new { error = "Username already taken" });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = req.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                ApiToken = TokenGenerator.NewToken(),
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new AuthResponse(user.Id, user.Username, user.ApiToken));
        });

        group.MapPost("/login", [Microsoft.AspNetCore.Authorization.AllowAnonymous] async (LoginRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username, ct);
            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Results.Unauthorized();

            return Results.Ok(new AuthResponse(user.Id, user.Username, user.ApiToken));
        });

        group.MapPost("/rotate-token", async (HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
            user.ApiToken = TokenGenerator.NewToken();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new AuthResponse(user.Id, user.Username, user.ApiToken));
        }).RequireAuthorization();
    }
}
