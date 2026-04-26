using Api.Auth;
using Api.Dtos;
using Api.Services;
using Core.Entities;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class PostEndpoints
{
    public static void MapPostEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1").WithTags("Posts").RequireAuthorization();

        group.MapGet("/channels/{id:guid}/posts",
            async (Guid id, int? limit, DateTimeOffset? before, HttpContext ctx, AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (!await guard.CanReadAsync(id, userId, ct)) return Results.NotFound();

            var take = Math.Clamp(limit ?? 50, 1, 200);
            var q = db.Posts.AsNoTracking().Where(p => p.ChannelId == id);
            if (before is not null) q = q.Where(p => p.CreatedAt < before);
            var items = await q.OrderByDescending(p => p.CreatedAt).Take(take)
                .Select(p => new PostResponse(
                    p.Id, p.ChannelId, p.AuthorId, p.Author!.Username, p.Body, p.CreatedAt))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapPost("/channels/{id:guid}/posts",
            async (Guid id, CreatePostRequest req, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (string.IsNullOrWhiteSpace(req.Body))
                return Results.BadRequest(new { error = "Body required" });
            var body = req.Body.Trim();
            if (body.Length > 4096)
                return Results.BadRequest(new { error = "Body too long" });

            var ch = await db.Channels.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();

            var canPost = ch.OwnerId == userId
                || await db.ChannelMembers.AnyAsync(m => m.ChannelId == id && m.UserId == userId, ct);
            if (!canPost) return Results.Forbid();

            var author = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
            var post = new Post
            {
                Id = Guid.NewGuid(),
                ChannelId = id,
                AuthorId = userId,
                Body = body,
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Posts.Add(post);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/channels/{id}/posts/{post.Id}",
                new PostResponse(post.Id, post.ChannelId, post.AuthorId, author.Username, post.Body, post.CreatedAt));
        });
    }
}
