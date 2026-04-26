using FluentAssertions;
using Xunit;

namespace IntegrationTests;

[Collection("api")]
public class SmokeTests : IAsyncLifetime
{
    private readonly WebAppFactory _factory;
    public SmokeTests(WebAppFactory factory) => _factory = factory;

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Full_flow_register_channel_visit_lookup()
    {
        var client = _factory.CreateClient();

        var alice = await client.RegisterAsync("alice");
        var ch = await client.CreateChannelAsync(alice.ApiToken, "alice-feed");
        await client.PostVisitAsync(alice.ApiToken, "https://example.com/article", ch.Id, "Article");

        var bob = await client.RegisterAsync("bob");
        var bobClient = _factory.CreateClient().WithToken(bob.ApiToken);
        var sub = await bobClient.PostAsync($"/api/v1/channels/{ch.Id}/subscribe", null);
        sub.IsSuccessStatusCode.Should().BeTrue();

        var result = await bobClient.LookupAsync(bob.ApiToken, "https://example.com/article");
        result.Should().ContainKey("https://example.com/article");
        var visitor = result["https://example.com/article"].Single();
        visitor.Username.Should().Be("alice");
        visitor.ChannelName.Should().Be("alice-feed");
    }
}
