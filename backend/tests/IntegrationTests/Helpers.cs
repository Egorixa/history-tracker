using System.Net.Http.Headers;
using System.Net.Http.Json;
using Api.Dtos;
using Core.Entities;

namespace IntegrationTests;

internal static class Helpers
{
    public static HttpClient WithToken(this HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public static async Task<AuthResponse> RegisterAsync(this HttpClient client, string username, string password = "passw0rd")
    {
        var resp = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(username, password));
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    public static async Task<HttpResponseMessage> LoginAsync(this HttpClient client, string username, string password = "passw0rd")
    {
        return await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(username, password));
    }

    public static async Task<ChannelResponse> CreateChannelAsync(
        this HttpClient client, string token, string name, ChannelVisibility visibility = ChannelVisibility.Public)
    {
        client.WithToken(token);
        var resp = await client.PostAsJsonAsync("/api/v1/channels",
            new CreateChannelRequest(name, null, visibility));
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<ChannelResponse>())!;
    }

    public static async Task PostVisitAsync(this HttpClient client, string token, string url, Guid channelId, string? title = null)
    {
        client.WithToken(token);
        var resp = await client.PostAsJsonAsync("/api/v1/visits",
            new CreateVisitRequest(url, title, new List<Guid> { channelId }));
        resp.EnsureSuccessStatusCode();
    }

    public static async Task<Dictionary<string, List<LookupVisitor>>> LookupAsync(
        this HttpClient client, string token, params string[] urls)
    {
        client.WithToken(token);
        var resp = await client.PostAsJsonAsync("/api/v1/lookup/by-url", new LookupRequest(urls.ToList()));
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<Dictionary<string, List<LookupVisitor>>>())!;
    }
}
