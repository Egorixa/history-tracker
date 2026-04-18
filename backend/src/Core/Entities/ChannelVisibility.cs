// ChannelVisibility — публичный / приватный канал. Хранится как int в БД.
namespace Core.Entities;

public enum ChannelVisibility
{
    Public = 0,
    Private = 1
}
