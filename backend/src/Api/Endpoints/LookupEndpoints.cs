using Api.Auth;
using Api.Dtos;
using Api.Services;
using Core.Services;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class LookupEndpoints
{
    public static void MapLookupEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/lookup").WithTags("Lookup").RequireAuthorization();

        group.MapPost("/by-url", async (LookupRequest req, HttpContext ctx, AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            if (req.Urls is null || req.Urls.Count == 0)
                return Results.Ok(new Dictionary<string, List<LookupVisitor>>());
            if (req.Urls.Count > 200)
                return Results.BadRequest(new { error = "Too many urls (max 200)" });

            var userId = CurrentUser.GetId(ctx.User);
            var readable = await guard.ReadableChannelIdsAsync(userId, ct);
            if (readable.Count == 0)
                return Results.Ok(new Dictionary<string, List<LookupVisitor>>());

            var map = new Dictionary<string, byte[]>(req.Urls.Count);
            foreach (var raw in req.Urls)
            {
                if (UrlNormalizer.TryNormalize(raw, out var norm))
                    map[raw] = UrlNormalizer.Hash(norm);
            }

            if (map.Count == 0)
                return Results.Ok(new Dictionary<string, List<LookupVisitor>>());

            var hashes = map.Values.ToArray();
            var rows = await db.Visits.AsNoTracking()
                .Where(v => hashes.Contains(v.UrlHash) && readable.Contains(v.ChannelId))
                .GroupBy(v => new { v.UrlHash, v.UserId, v.ChannelId })
                .Select(g => new
                {
                    g.Key.UrlHash,
                    g.Key.UserId,
                    g.Key.ChannelId,
                    LastVisitedAt = g.Max(v => v.VisitedAt)
                })
                .ToListAsync(ct);

            var userIds = rows.Select(r => r.UserId).Distinct().ToList();
            var chIds = rows.Select(r => r.ChannelId).Distinct().ToList();
            var users = await db.Users.AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.Username, ct);
            var channels = await db.Channels.AsNoTracking()
                .Where(c => chIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

            var result = new Dictionary<string, List<LookupVisitor>>(req.Urls.Count);
            foreach (var (rawUrl, hash) in map)
            {
                var list = rows
                    .Where(r => r.UrlHash.SequenceEqual(hash) && r.UserId != userId)
                    .OrderByDescending(r => r.LastVisitedAt)
                    .Take(5)
                    .Select(r => new LookupVisitor(
                        r.UserId,
                        users.GetValueOrDefault(r.UserId, "?"),
                        r.ChannelId,
                        channels.GetValueOrDefault(r.ChannelId, "?"),
                        r.LastVisitedAt))
                    .ToList();
                result[rawUrl] = list;
            }

            return Results.Ok(result);
        });
    }
}
