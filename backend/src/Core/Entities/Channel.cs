namespace Core.Entities;

public class Channel
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public User? Owner { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ChannelVisibility Visibility { get; set; }
    public bool IsGroup { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<ChannelMember> Members { get; set; } = new List<ChannelMember>();
    public ICollection<Visit> Visits { get; set; } = new List<Visit>();
    public ICollection<Post> Posts { get; set; } = new List<Post>();
    public ICollection<SiteThread> SiteThreads { get; set; } = new List<SiteThread>();
}
