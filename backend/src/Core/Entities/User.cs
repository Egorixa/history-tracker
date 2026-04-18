// User — аккаунт сервиса. api_token отдаётся один раз при регистрации/логине
// и вставляется в расширение для авторизации запросов.
namespace Core.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string ApiToken { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<Channel> OwnedChannels { get; set; } = new List<Channel>();
    public ICollection<ChannelMember> Memberships { get; set; } = new List<ChannelMember>();
}
