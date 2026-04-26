using Core.Entities;
using Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

public class ChannelAccessGuard
{
    private readonly AppDbContext _db;

    public ChannelAccessGuard(AppDbContext db) => _db = db;

    public async Task<bool> CanReadAsync(Guid channelId, Guid userId, CancellationToken ct = default)
    {
        var ch = await _db.Channels.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == channelId, ct);
        if (ch is null) return false;
        if (ch.Visibility == ChannelVisibility.Public) return true;
        if (ch.OwnerId == userId) return true;
        return await _db.ChannelMembers.AnyAsync(
            m => m.ChannelId == channelId && m.UserId == userId, ct);
    }

    public Task<bool> IsOwnerAsync(Guid channelId, Guid userId, CancellationToken ct = default) =>
        _db.Channels.AnyAsync(c => c.Id == channelId && c.OwnerId == userId, ct);

    public async Task<IReadOnlyList<Guid>> ReadableChannelIdsAsync(Guid userId, CancellationToken ct = default)
    {
        var owned = _db.Channels.Where(c => c.OwnerId == userId).Select(c => c.Id);
        var member = _db.ChannelMembers.Where(m => m.UserId == userId).Select(m => m.ChannelId);
        var publicIds = _db.Channels.Where(c => c.Visibility == ChannelVisibility.Public).Select(c => c.Id);
        return await owned.Union(member).Union(publicIds).Distinct().ToListAsync(ct);
    }
}
