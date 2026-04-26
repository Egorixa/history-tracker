namespace Core.Entities;

public class Post
{
    public Guid Id { get; set; }
    public Guid ChannelId { get; set; }
    public Channel? Channel { get; set; }
    public Guid AuthorId { get; set; }
    public User? Author { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
