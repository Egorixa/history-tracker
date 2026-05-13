using Api.Auth;
using Api.Dtos;
using Api.Services;
using Core.Entities;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class ChannelEndpoints
{
    public static void MapChannelEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/channels")
            .WithTags("Channels")
            .RequireAuthorization();

        group.MapGet("/my", async (HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var owned = await db.Channels.AsNoTracking()
                .Where(c => c.OwnerId == userId)
                .Select(c => new ChannelResponse(c.Id, c.OwnerId, c.Name, c.Description, c.Visibility, c.CreatedAt, "owner"))
                .ToListAsync(ct);
            var member = await db.ChannelMembers.AsNoTracking()
                .Where(m => m.UserId == userId)
                .Include(m => m.Channel)
                .Select(m => new ChannelResponse(
                    m.Channel!.Id, m.Channel.OwnerId, m.Channel.Name, m.Channel.Description,
                    m.Channel.Visibility, m.Channel.CreatedAt, "member"))
                .ToListAsync(ct);
            return Results.Ok(owned.Concat(member));
        });

        group.MapGet("/public", async (string? query, AppDbContext db, CancellationToken ct) =>
        {
            var q = db.Channels.AsNoTracking().Where(c => c.Visibility == ChannelVisibility.Public);
            if (!string.IsNullOrWhiteSpace(query))
                q = q.Where(c => EF.Functions.ILike(c.Name, $"%{query}%"));
            var list = await q.OrderBy(c => c.Name).Take(50)
                .Select(c => new ChannelResponse(c.Id, c.OwnerId, c.Name, c.Description, c.Visibility, c.CreatedAt, "none"))
                .ToListAsync(ct);
            return Results.Ok(list);
        });

        group.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, AppDbContext db, ChannelAccessGuard guard, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            if (!await guard.CanReadAsync(id, userId, ct)) return Results.NotFound();
            var c = await db.Channels.AsNoTracking().FirstAsync(x => x.Id == id, ct);
            var role = c.OwnerId == userId ? "owner"
                : await db.ChannelMembers.AnyAsync(m => m.ChannelId == id && m.UserId == userId, ct) ? "member"
                : "public";
            return Results.Ok(new ChannelResponse(c.Id, c.OwnerId, c.Name, c.Description, c.Visibility, c.CreatedAt, role));
        });

        group.MapPost("/", async (CreateChannelRequest req, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name)) return Results.BadRequest(new { error = "Name required" });
            var userId = CurrentUser.GetId(ctx.User);
            var channel = new Channel
            {
                Id = Guid.NewGuid(),
                OwnerId = userId,
                Name = req.Name.Trim(),
                Description = req.Description,
                Visibility = req.Visibility,
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Channels.Add(channel);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/channels/{channel.Id}",
                new ChannelResponse(channel.Id, channel.OwnerId, channel.Name, channel.Description,
                    channel.Visibility, channel.CreatedAt, "owner"));
        });

        group.MapPatch("/{id:guid}", async (Guid id, UpdateChannelRequest req, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.OwnerId != userId) return Results.Forbid();
            if (!string.IsNullOrWhiteSpace(req.Name)) ch.Name = req.Name.Trim();
            if (req.Description is not null) ch.Description = req.Description;
            if (req.Visibility is not null) ch.Visibility = req.Visibility.Value;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.OwnerId != userId) return Results.Forbid();
            db.Channels.Remove(ch);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapPost("/{id:guid}/subscribe", async (Guid id, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.Visibility != ChannelVisibility.Public) return Results.Forbid();
            if (ch.OwnerId == userId) return Results.NoContent();

            var exists = await db.ChannelMembers.AnyAsync(m => m.ChannelId == id && m.UserId == userId, ct);
            if (!exists)
            {
                db.ChannelMembers.Add(new ChannelMember
                {
                    ChannelId = id,
                    UserId = userId,
                    JoinedAt = DateTimeOffset.UtcNow
                });
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        group.MapGet("/{id:guid}/members", async (Guid id, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.OwnerId != userId) return Results.Forbid();

            var members = await db.ChannelMembers.AsNoTracking()
                .Where(m => m.ChannelId == id)
                .Include(m => m.User)
                .OrderBy(m => m.JoinedAt)
                .Select(m => new ChannelMemberResponse(m.UserId, m.User!.Username, m.JoinedAt))
                .ToListAsync(ct);
            return Results.Ok(members);
        });

        group.MapPost("/{id:guid}/members", async (Guid id, AddMemberRequest req, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.OwnerId != userId) return Results.Forbid();

            var target = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username, ct);
            if (target is null) return Results.NotFound(new { error = "User not found" });
            if (target.Id == userId) return Results.BadRequest(new { error = "Owner is already a member" });

            var exists = await db.ChannelMembers.AnyAsync(m => m.ChannelId == id && m.UserId == target.Id, ct);
            if (!exists)
            {
                db.ChannelMembers.Add(new ChannelMember
                {
                    ChannelId = id,
                    UserId = target.Id,
                    JoinedAt = DateTimeOffset.UtcNow
                });
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        group.MapDelete("/{id:guid}/members/{memberId:guid}", async (Guid id, Guid memberId, HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(ctx.User);
            var ch = await db.Channels.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (ch is null) return Results.NotFound();
            if (ch.OwnerId != userId && memberId != userId) return Results.Forbid();

            var mem = await db.ChannelMembers.FirstOrDefaultAsync(m => m.ChannelId == id && m.UserId == memberId, ct);
            if (mem is not null)
            {
                db.ChannelMembers.Remove(mem);
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });
    }
}
