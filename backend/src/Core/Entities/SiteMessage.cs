namespace Core.Entities;

public class SiteMessage
{
    public Guid Id { get; set; }
    public Guid ThreadId { get; set; }
    public SiteThread? Thread { get; set; }
    public Guid AuthorId { get; set; }
    public User? Author { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
