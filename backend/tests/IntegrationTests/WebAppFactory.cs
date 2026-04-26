using Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace IntegrationTests;

public sealed class WebAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("history_test")
        .WithUsername("history")
        .WithPassword("history")
        .Build();

    public async Task InitializeAsync()
    {
        await _pg.StartAsync();

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }

    public new async Task DisposeAsync()
    {
        await _pg.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, cfg) =>
        {
            cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Postgres"] = _pg.GetConnectionString()
            });
        });

        builder.ConfigureServices(services =>
        {

            var descriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                            d.ServiceType == typeof(AppDbContext))
                .ToList();
            foreach (var d in descriptors) services.Remove(d);
            services.AddDbContext<AppDbContext>(opt => opt.UseNpgsql(_pg.GetConnectionString()));
        });
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE visits, channel_members, channels, users RESTART IDENTITY CASCADE;");
    }
}

[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<WebAppFactory> { }
