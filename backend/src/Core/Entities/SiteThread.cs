namespace Core.Entities;

public class SiteThread
{
    public Guid Id { get; set; }
    public Guid ChannelId { get; set; }
    public Channel? Channel { get; set; }

    public string Url { get; set; } = string.Empty;
    public byte[] UrlHash { get; set; } = Array.Empty<byte>();

    public string? ElementKey { get; set; }
    public string? ElementLabel { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastMessageAt { get; set; }
    public int MessageCount { get; set; }

    public ICollection<SiteMessage> Messages { get; set; } = new List<SiteMessage>();
}
