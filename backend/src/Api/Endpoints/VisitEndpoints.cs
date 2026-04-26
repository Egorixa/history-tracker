using Api.Auth;
using Api.Dtos;
using Api.Services;
using Core.Entities;
using Core.Services;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class VisitEndpoints
{
    public static void MapVisitEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1").WithTags("Visits").RequireAuthorization();

        group.MapPost("/visits", async (CreateVisitRequest req, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (req.ChannelIds is null || req.ChannelIds.Count == 0)
                return Results.BadRequest(new { error = "channelIds required" });
            if (!UrlNormalizer.TryNormalize(req.Url, out var normalized))
                return Results.BadRequest(new { error = "Invalid url" });

            var ownedIds = await db.Channels
                .Where(c => req.ChannelIds.Contains(c.Id) && c.OwnerId == userId)
                .Select(c => c.Id)
                .ToListAsync(ct);
            if (ownedIds.Count == 0)
                return Results.Forbid();

            var hash = UrlNormalizer.Hash(normalized);
            var now = DateTimeOffset.UtcNow;
            var titleClean = string.IsNullOrWhiteSpace(req.Title) ? null : req.Title.Trim();

            foreach (var cid in ownedIds)
            {
                db.Visits.Add(new Visit
                {
                    UserId = userId,
                    ChannelId = cid,
                    Url = normalized,
                    UrlHash = hash,
                    Title = titleClean,
                    VisitedAt = now
                });
            }
            await db.SaveChangesAsync(ct);
            return Results.Created();
        });

        group.MapGet("/channels/{id:guid}/visits",
            async (Guid id, int? limit, DateTimeOffset? before, HttpContext ctx, AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (!await guard.CanReadAsync(id, userId, ct)) return Results.NotFound();

            var take = Math.Clamp(limit ?? 50, 1, 200);
            var q = db.Visits.AsNoTracking().Where(v => v.ChannelId == id);
            if (before is not null) q = q.Where(v => v.VisitedAt < before);
            var items = await q.OrderByDescending(v => v.VisitedAt).Take(take)
                .Select(v => new VisitResponse(
                    v.Id, v.UserId, v.User!.Username, v.ChannelId, v.Url, v.Title, v.VisitedAt))
                .ToListAsync(ct);
            return Results.Ok(items);
        });
    }
}
