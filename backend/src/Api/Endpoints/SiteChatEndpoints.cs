using Api.Auth;
using Api.Dtos;
using Api.Services;
using Core.Entities;
using Core.Services;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class SiteChatEndpoints
{
    public static void MapSiteChatEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1").WithTags("SiteChat").RequireAuthorization();

        group.MapGet("/channels/{id:guid}/sites/threads",
            async (Guid id, bool? elementsOnly, int? limit, HttpContext ctx,
                AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (!await guard.CanReadAsync(id, userId, ct)) return Results.NotFound();

            var take = Math.Clamp(limit ?? 50, 1, 200);
            var q = db.SiteThreads.AsNoTracking().Where(t => t.ChannelId == id);
            if (elementsOnly == true) q = q.Where(t => t.ElementKey != null);

            var items = await q.OrderByDescending(t => t.LastMessageAt)
                .Take(take)
                .Select(t => new SiteThreadResponse(
                    t.Id, t.ChannelId, t.Url, t.ElementKey, t.ElementLabel,
                    t.CreatedAt, t.LastMessageAt, t.MessageCount))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapGet("/channels/{id:guid}/sites/messages",
            async (Guid id, string url, string? elementKey, int? limit, DateTimeOffset? before,
                HttpContext ctx, AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (!await guard.CanReadAsync(id, userId, ct)) return Results.NotFound();
            if (!UrlNormalizer.TryNormalize(url, out var normalized))
                return Results.BadRequest(new { error = "Invalid url" });

            var hash = UrlNormalizer.Hash(normalized);
            var key = NormalizeElementKey(elementKey);

            var thread = await FindThreadAsync(db, id, hash, key, ct);
            if (thread is null)
            {
                return Results.Ok(new
                {
                    thread = (SiteThreadResponse?)null,
                    messages = Array.Empty<SiteMessageResponse>()
                });
            }

            var take = Math.Clamp(limit ?? 50, 1, 200);
            var q = db.SiteMessages.AsNoTracking().Where(m => m.ThreadId == thread.Id);
            if (before is not null) q = q.Where(m => m.CreatedAt < before);
            var messages = await q.OrderByDescending(m => m.CreatedAt).Take(take)
                .Select(m => new SiteMessageResponse(
                    m.Id, m.ThreadId, m.AuthorId, m.Author!.Username, m.Body, m.CreatedAt))
                .ToListAsync(ct);

            return Results.Ok(new
            {
                thread = new SiteThreadResponse(
                    thread.Id, thread.ChannelId, thread.Url, thread.ElementKey, thread.ElementLabel,
                    thread.CreatedAt, thread.LastMessageAt, thread.MessageCount),
                messages
            });
        });

        group.MapPost("/channels/{id:guid}/sites/messages",
            async (Guid id, CreateSiteMessageRequest req, HttpContext ctx,
                AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (string.IsNullOrWhiteSpace(req.Body))
                return Results.BadRequest(new { error = "Body required" });
            var body = req.Body.Trim();
            if (body.Length > 4096)
                return Results.BadRequest(new { error = "Body too long" });
            if (!UrlNormalizer.TryNormalize(req.Url, out var normalized))
                return Results.BadRequest(new { error = "Invalid url" });

            var ch = await db.Channels.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();

            var canPost = ch.OwnerId == userId
                || await db.ChannelMembers.AnyAsync(m => m.ChannelId == id && m.UserId == userId, ct);
            if (!canPost) return Results.Forbid();

            var hash = UrlNormalizer.Hash(normalized);
            var key = NormalizeElementKey(req.ElementKey);
            var label = string.IsNullOrWhiteSpace(req.ElementLabel) ? null : req.ElementLabel!.Trim();
            var now = DateTimeOffset.UtcNow;

            var thread = await FindThreadAsync(db, id, hash, key, ct);
            if (thread is null)
            {
                thread = new SiteThread
                {
                    Id = Guid.NewGuid(),
                    ChannelId = id,
                    Url = normalized,
                    UrlHash = hash,
                    ElementKey = key,
                    ElementLabel = label,
                    CreatedAt = now,
                    LastMessageAt = now,
                    MessageCount = 0
                };
                db.SiteThreads.Add(thread);
            }
            else
            {
                if (string.IsNullOrEmpty(thread.ElementLabel) && !string.IsNullOrEmpty(label))
                    thread.ElementLabel = label;
            }

            thread.LastMessageAt = now;
            thread.MessageCount += 1;

            var author = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
            var msg = new SiteMessage
            {
                Id = Guid.NewGuid(),
                ThreadId = thread.Id,
                AuthorId = userId,
                Body = body,
                CreatedAt = now
            };
            db.SiteMessages.Add(msg);
            await db.SaveChangesAsync(ct);

            return Results.Created(
                $"/api/v1/channels/{id}/sites/messages/{msg.Id}",
                new SiteMessageResponse(
                    msg.Id, msg.ThreadId, msg.AuthorId, author.Username, msg.Body, msg.CreatedAt));
        });
    }

    private static string? NormalizeElementKey(string? raw)
    {
        if (raw is null) return null;
        var trimmed = raw.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static Task<SiteThread?> FindThreadAsync(
        AppDbContext db, Guid channelId, byte[] urlHash, string? elementKey, CancellationToken ct)
    {
        var q = db.SiteThreads.Where(t => t.ChannelId == channelId && t.UrlHash == urlHash);
        q = elementKey is null
            ? q.Where(t => t.ElementKey == null)
            : q.Where(t => t.ElementKey == elementKey);
        return q.FirstOrDefaultAsync(ct);
    }
}
