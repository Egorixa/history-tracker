using System.Net;
using System.Net.Http.Json;
using Api.Dtos;
using Core.Entities;
using FluentAssertions;
using Xunit;

namespace IntegrationTests;

[Collection("api")]
public class ChannelTests : IAsyncLifetime
{
    private readonly WebAppFactory _factory;
    public ChannelTests(WebAppFactory factory) => _factory = factory;

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Owner_sees_own_channel_in_my_list()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        client.WithToken(alice.ApiToken);
        var list = await client.GetFromJsonAsync<List<ChannelResponse>>("/api/v1/channels/my");
        list.Should().ContainSingle(c => c.Id == ch.Id && c.Role == "owner");
    }

    [Fact]
    public async Task Public_channels_are_discoverable_private_are_not()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var pub = await client.CreateChannelAsync(alice.ApiToken, "alice-public", ChannelVisibility.Public);
        var priv = await client.CreateChannelAsync(alice.ApiToken, "alice-private", ChannelVisibility.Private);

        var bob = await client.RegisterAsync("bob");
        client.WithToken(bob.ApiToken);
        var publicList = await client.GetFromJsonAsync<List<ChannelResponse>>("/api/v1/channels/public");
        publicList!.Select(c => c.Id).Should().Contain(pub.Id).And.NotContain(priv.Id);
    }

    [Fact]
    public async Task Subscribe_makes_channel_appear_in_my_as_member()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        var bob = await client.RegisterAsync("bob");
        client.WithToken(bob.ApiToken);
        var sub = await client.PostAsync($"/api/v1/channels/{ch.Id}/subscribe", null);
        sub.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var list = await client.GetFromJsonAsync<List<ChannelResponse>>("/api/v1/channels/my");
        list.Should().ContainSingle(c => c.Id == ch.Id && c.Role == "member");
    }

    [Fact]
    public async Task Subscribe_to_private_channel_is_forbidden()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var priv = await client.CreateChannelAsync(alice.ApiToken, "alice-private", ChannelVisibility.Private);

        var bob = await client.RegisterAsync("bob");
        client.WithToken(bob.ApiToken);
        var sub = await client.PostAsync($"/api/v1/channels/{priv.Id}/subscribe", null);
        sub.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Reading_private_channel_as_outsider_returns_404()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var priv = await client.CreateChannelAsync(alice.ApiToken, "alice-private", ChannelVisibility.Private);

        var bob = await client.RegisterAsync("bob");
        client.WithToken(bob.ApiToken);
        var resp = await client.GetAsync($"/api/v1/channels/{priv.Id}");
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
