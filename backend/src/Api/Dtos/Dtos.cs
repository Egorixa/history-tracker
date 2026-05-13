using Core.Entities;

namespace Api.Dtos;

public record RegisterRequest(string Username, string Password);
public record LoginRequest(string Username, string Password);
public record AuthResponse(Guid UserId, string Username, string ApiToken);

public record CreateChannelRequest(string Name, string? Description, ChannelVisibility Visibility, bool IsGroup = false);
public record UpdateChannelRequest(string? Name, string? Description, ChannelVisibility? Visibility, bool? IsGroup);
public record ChannelResponse(
    Guid Id,
    Guid OwnerId,
    string Name,
    string? Description,
    ChannelVisibility Visibility,
    bool IsGroup,
    DateTimeOffset CreatedAt,
    string Role);

public record AddMemberRequest(string Username);
public record ChannelMemberResponse(Guid UserId, string Username, DateTimeOffset JoinedAt);

public record CreateVisitRequest(string Url, string? Title, List<Guid> ChannelIds);
public record VisitResponse(
    long Id,
    Guid UserId,
    string UserUsername,
    Guid ChannelId,
    string Url,
    string? Title,
    DateTimeOffset VisitedAt);

public record CreatePostRequest(string Body);
public record PostResponse(
    Guid Id,
    Guid ChannelId,
    Guid AuthorId,
    string AuthorUsername,
    string Body,
    DateTimeOffset CreatedAt);

public record LookupRequest(List<string> Urls);
public record LookupVisitor(
    Guid UserId,
    string Username,
    Guid ChannelId,
    string ChannelName,
    DateTimeOffset LastVisitedAt);
