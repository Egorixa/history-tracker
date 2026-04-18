// DTO records для входа/выхода всех эндпойнтов. Отделены от доменных entities,
// чтобы контракт API не ломался при изменении модели БД.
using Core.Entities;

namespace Api.Dtos;

public record RegisterRequest(string Username, string Password);
public record LoginRequest(string Username, string Password);
public record AuthResponse(Guid UserId, string Username, string ApiToken);

public record CreateChannelRequest(string Name, string? Description, ChannelVisibility Visibility);
public record UpdateChannelRequest(string? Name, string? Description, ChannelVisibility? Visibility);
public record ChannelResponse(
    Guid Id,
    Guid OwnerId,
    string Name,
    string? Description,
    ChannelVisibility Visibility,
    DateTimeOffset CreatedAt,
    string Role);

public record AddMemberRequest(string Username);

public record CreateVisitRequest(string Url, string? Title, List<Guid> ChannelIds);
public record VisitResponse(
    long Id,
    Guid UserId,
    Guid ChannelId,
    string Url,
    string? Title,
    DateTimeOffset VisitedAt);

public record LookupRequest(List<string> Urls);
public record LookupVisitor(
    Guid UserId,
    string Username,
    Guid ChannelId,
    string ChannelName,
    DateTimeOffset LastVisitedAt);
