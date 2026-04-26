using System.Net;
using System.Net.Http.Json;
using Api.Dtos;
using FluentAssertions;
using Xunit;

namespace IntegrationTests;

[Collection("api")]
public class AuthTests : IAsyncLifetime
{
    private readonly WebAppFactory _factory;
    public AuthTests(WebAppFactory factory) => _factory = factory;

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Register_returns_token_and_login_succeeds()
    {
        var client = _factory.CreateClient();
        var auth = await client.RegisterAsync("alice");
        auth.Username.Should().Be("alice");
        auth.ApiToken.Should().NotBeNullOrEmpty();
        auth.UserId.Should().NotBeEmpty();

        var login = await client.LoginAsync("alice");
        login.StatusCode.Should().Be(HttpStatusCode.OK);
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();
        loginBody!.ApiToken.Should().Be(auth.ApiToken);
    }

    [Theory]
    [InlineData("ab", "passw0rd")]
    [InlineData("alice", "12345")]
    [InlineData("", "passw0rd")]
    public async Task Register_rejects_invalid_input(string username, string password)
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(username, password));
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Register_duplicate_username_returns_409()
    {
        var client = _factory.CreateClient();
        await client.RegisterAsync("dup");
        var resp = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest("dup", "passw0rd"));
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401()
    {
        var client = _factory.CreateClient();
        await client.RegisterAsync("eve");
        var resp = await client.LoginAsync("eve", "wrong-password");
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Rotate_token_invalidates_old_token()
    {
        var client = _factory.CreateClient();
        var auth = await client.RegisterAsync("rota");
        client.WithToken(auth.ApiToken);

        var rotate = await client.PostAsync("/api/v1/auth/rotate-token", null);
        rotate.StatusCode.Should().Be(HttpStatusCode.OK);
        var newAuth = (await rotate.Content.ReadFromJsonAsync<AuthResponse>())!;
        newAuth.ApiToken.Should().NotBe(auth.ApiToken);

        var oldClient = _factory.CreateClient().WithToken(auth.ApiToken);
        var resp = await oldClient.GetAsync("/api/v1/channels/my");
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Unauthenticated_request_to_protected_endpoint_returns_401()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/channels/my");
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
