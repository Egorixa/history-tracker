namespace Core.Entities;

public class ChannelMember
{
    public Guid ChannelId { get; set; }
    public Channel? Channel { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
}
