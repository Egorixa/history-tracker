// Visit — одна запись о посещении URL одним пользователем в одном канале.
// UrlHash (SHA-256) — то, по чему ищем посетителей страницы.
namespace Core.Entities;

public class Visit
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid ChannelId { get; set; }
    public Channel? Channel { get; set; }
    public string Url { get; set; } = string.Empty;
    public byte[] UrlHash { get; set; } = Array.Empty<byte>();
    public string? Title { get; set; }
    public DateTimeOffset VisitedAt { get; set; }
}
