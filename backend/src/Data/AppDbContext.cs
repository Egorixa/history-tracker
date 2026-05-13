using Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Channel> Channels => Set<Channel>();
    public DbSet<ChannelMember> ChannelMembers => Set<ChannelMember>();
    public DbSet<Visit> Visits => Set<Visit>();
    public DbSet<Post> Posts => Set<Post>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Username).HasColumnName("username").HasMaxLength(64).IsRequired();
            e.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
            e.Property(x => x.ApiToken).HasColumnName("api_token").HasMaxLength(128).IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.ApiToken).IsUnique();
        });

        b.Entity<Channel>(e =>
        {
            e.ToTable("channels");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.OwnerId).HasColumnName("owner_id");
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(128).IsRequired();
            e.Property(x => x.Description).HasColumnName("description").HasMaxLength(1024);
            e.Property(x => x.Visibility).HasColumnName("visibility").HasConversion<int>();
            e.Property(x => x.IsGroup).HasColumnName("is_group").HasDefaultValue(false);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasOne(x => x.Owner)
                .WithMany(u => u.OwnedChannels)
                .HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.OwnerId);
        });

        b.Entity<ChannelMember>(e =>
        {
            e.ToTable("channel_members");
            e.HasKey(x => new { x.ChannelId, x.UserId });
            e.Property(x => x.ChannelId).HasColumnName("channel_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.JoinedAt).HasColumnName("joined_at");
            e.HasOne(x => x.Channel)
                .WithMany(c => c.Members)
                .HasForeignKey(x => x.ChannelId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User)
                .WithMany(u => u.Memberships)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.UserId);
        });

        b.Entity<Visit>(e =>
        {
            e.ToTable("visits");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.ChannelId).HasColumnName("channel_id");
            e.Property(x => x.Url).HasColumnName("url").HasMaxLength(2048).IsRequired();
            e.Property(x => x.UrlHash).HasColumnName("url_hash").IsRequired();
            e.Property(x => x.Title).HasColumnName("title").HasMaxLength(512);
            e.Property(x => x.VisitedAt).HasColumnName("visited_at");
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Channel)
                .WithMany(c => c.Visits)
                .HasForeignKey(x => x.ChannelId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UrlHash, x.ChannelId });
            e.HasIndex(x => new { x.UserId, x.VisitedAt });
            e.HasIndex(x => x.ChannelId);
        });

        b.Entity<Post>(e =>
        {
            e.ToTable("posts");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ChannelId).HasColumnName("channel_id");
            e.Property(x => x.AuthorId).HasColumnName("author_id");
            e.Property(x => x.Body).HasColumnName("body").HasMaxLength(4096).IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasOne(x => x.Channel)
                .WithMany(c => c.Posts)
                .HasForeignKey(x => x.ChannelId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Author)
                .WithMany()
                .HasForeignKey(x => x.AuthorId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ChannelId, x.CreatedAt });
        });
    }
}
