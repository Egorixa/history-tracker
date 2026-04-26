using System.Net;
using System.Net.Http.Json;
using Api.Dtos;
using FluentAssertions;
using Xunit;

namespace IntegrationTests;

[Collection("api")]
public class VisitTests : IAsyncLifetime
{
    private readonly WebAppFactory _factory;
    public VisitTests(WebAppFactory factory) => _factory = factory;

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Owner_can_post_visit_and_read_back()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        await client.PostVisitAsync(alice.ApiToken, "https://example.com/article", ch.Id, "demo");

        client.WithToken(alice.ApiToken);
        var visits = await client.GetFromJsonAsync<List<VisitResponse>>($"/api/v1/channels/{ch.Id}/visits");
        visits.Should().ContainSingle(v => v.Url == "https://example.com/article" && v.Title == "demo");
    }

    [Fact]
    public async Task Non_owner_cannot_post_visit_into_other_channel()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        var bob = await client.RegisterAsync("bob");
        client.WithToken(bob.ApiToken);
        var resp = await client.PostAsJsonAsync("/api/v1/visits",
            new CreateVisitRequest("https://example.com/x", null, new List<Guid> { ch.Id }));
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Invalid_url_returns_400()
    {
        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        client.WithToken(alice.ApiToken);
        var resp = await client.PostAsJsonAsync("/api/v1/visits",
            new CreateVisitRequest("not-a-url", null, new List<Guid> { ch.Id }));
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Url_is_normalized_on_storage()
    {

        var client = _factory.CreateClient();
        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");

        await client.PostVisitAsync(alice.ApiToken,
            "https://WWW.Example.com/Article/?utm_source=x&id=42#section", ch.Id);

        client.WithToken(alice.ApiToken);
        var visits = await client.GetFromJsonAsync<List<VisitResponse>>($"/api/v1/channels/{ch.Id}/visits");
        visits.Should().ContainSingle(v => v.Url == "https://example.com/Article?id=42");
    }
}
