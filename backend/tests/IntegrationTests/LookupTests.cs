using System.Net;
using System.Net.Http.Json;
using Api.Dtos;
using FluentAssertions;
using Xunit;

namespace IntegrationTests;

[Collection("api")]
public class LookupTests : IAsyncLifetime
{
    private readonly WebAppFactory _factory;
    public LookupTests(WebAppFactory factory) => _factory = factory;

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Lookup_finds_visitor_in_subscribed_channel()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");
        await client.PostVisitAsync(alice.ApiToken, "https://example.com/x", ch.Id);

        var bob = await client.RegisterAsync("bob");
        var bobClient = _factory.CreateClient().WithToken(bob.ApiToken);
        await bobClient.PostAsync($"/api/v1/channels/{ch.Id}/subscribe", null);

        var result = await bobClient.LookupAsync(bob.ApiToken, "https://example.com/x");
        result["https://example.com/x"].Should().ContainSingle(v => v.Username == "alice");
    }

    [Fact]
    public async Task Lookup_excludes_self()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");
        await client.PostVisitAsync(alice.ApiToken, "https://example.com/x", ch.Id);

        var result = await client.LookupAsync(alice.ApiToken, "https://example.com/x");
        result["https://example.com/x"].Should().BeEmpty();
    }

    [Fact]
    public async Task Lookup_ignores_private_channels_outsider_is_not_member_of()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-secret", Core.Entities.ChannelVisibility.Private);
        await client.PostVisitAsync(alice.ApiToken, "https://example.com/x", ch.Id);

        var bob = await client.RegisterAsync("bob");
        var result = await client.LookupAsync(bob.ApiToken, "https://example.com/x");

        if (result.TryGetValue("https://example.com/x", out var list))
            list.Should().BeEmpty();
        else
            result.Should().BeEmpty();
    }

    [Fact]
    public async Task Lookup_matches_across_normalization_differences()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");
        await client.PostVisitAsync(alice.ApiToken,
            "https://www.Example.com/article/?utm_source=newsletter#top", ch.Id);

        var bob = await client.RegisterAsync("bob");
        var bobClient = _factory.CreateClient().WithToken(bob.ApiToken);
        await bobClient.PostAsync($"/api/v1/channels/{ch.Id}/subscribe", null);

        var result = await bobClient.LookupAsync(bob.ApiToken, "https://example.com/article");
        result["https://example.com/article"].Should().ContainSingle(v => v.Username == "alice");
    }

    [Fact]
    public async Task Lookup_with_more_than_200_urls_returns_400()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        client.WithToken(alice.ApiToken);

        var urls = Enumerable.Range(0, 201).Select(i => $"https://example.com/{i}").ToList();
        var resp = await client.PostAsJsonAsync("/api/v1/lookup/by-url", new LookupRequest(urls));
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Lookup_keeps_response_keyed_by_raw_input_url()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");
        await client.PostVisitAsync(alice.ApiToken, "https://example.com/x", ch.Id);

        var bob = await client.RegisterAsync("bob");
        var bobClient = _factory.CreateClient().WithToken(bob.ApiToken);
        await bobClient.PostAsync($"/api/v1/channels/{ch.Id}/subscribe", null);

        const string raw = "https://www.example.com/x?utm_source=foo";
        var result = await bobClient.LookupAsync(bob.ApiToken, raw);
        result.Should().ContainKey(raw);
        result[raw].Should().ContainSingle(v => v.Username == "alice");
    }
}
