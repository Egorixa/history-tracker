using Core.Services;
using FluentAssertions;
using Xunit;

namespace UnitTests;

public class UrlNormalizerTests
{
    [Theory]
    [InlineData("https://example.com", "https://example.com")]
    [InlineData("https://EXAMPLE.com", "https://example.com")]
    [InlineData("https://example.com/", "https://example.com")]
    [InlineData("https://example.com/path/", "https://example.com/path")]
    [InlineData("https://example.com/path", "https://example.com/path")]
    [InlineData("http://example.com:80/x", "http://example.com/x")]
    [InlineData("https://example.com:443/x", "https://example.com/x")]
    [InlineData("https://example.com:8080/x", "https://example.com:8080/x")]
    public void Normalizes_host_scheme_port_and_trailing_slash(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Theory]
    [InlineData("https://www.example.com/x", "https://example.com/x")]
    [InlineData("https://WWW.Example.COM/x", "https://example.com/x")]
    [InlineData("https://www2.example.com/x", "https://www2.example.com/x")]
    [InlineData("https://www.com/x", "https://www.com/x")]
    public void Strips_leading_www_subdomain(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Theory]
    [InlineData("https://example.com/x#section", "https://example.com/x")]
    [InlineData("https://example.com/x?a=1#anchor", "https://example.com/x?a=1")]
    [InlineData("https://example.com/x#", "https://example.com/x")]
    public void Drops_fragment(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Theory]
    [InlineData("https://example.com/x?utm_source=foo", "https://example.com/x")]
    [InlineData("https://example.com/x?utm_source=foo&utm_medium=bar", "https://example.com/x")]
    [InlineData("https://example.com/x?fbclid=abc", "https://example.com/x")]
    [InlineData("https://example.com/x?gclid=abc", "https://example.com/x")]
    [InlineData("https://example.com/x?yclid=abc", "https://example.com/x")]
    [InlineData("https://example.com/x?_ga=abc", "https://example.com/x")]
    [InlineData("https://example.com/x?ref=foo&id=42", "https://example.com/x?id=42")]
    [InlineData("https://example.com/x?id=42&utm_source=foo", "https://example.com/x?id=42")]
    public void Strips_tracking_params(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Theory]
    [InlineData("https://example.com/x?b=2&a=1", "https://example.com/x?a=1&b=2")]
    [InlineData("https://example.com/x?z=1&a=1&m=1", "https://example.com/x?a=1&m=1&z=1")]
    public void Sorts_query_params_deterministically(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Theory]
    [InlineData("ftp://example.com/x")]
    [InlineData("file:///etc/passwd")]
    [InlineData("not a url")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("javascript:alert(1)")]
    public void Rejects_non_http_schemes_and_garbage(string? input)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeFalse();
        actual.Should().BeEmpty();
    }

    [Fact]
    public void Rejects_null_input()
    {
        UrlNormalizer.TryNormalize(null, out var actual).Should().BeFalse();
        actual.Should().BeEmpty();
    }

    [Fact]
    public void Hash_is_deterministic_for_same_input()
    {
        UrlNormalizer.TryNormalize("https://example.com/x", out var a).Should().BeTrue();
        UrlNormalizer.TryNormalize("https://example.com/x", out var b).Should().BeTrue();
        UrlNormalizer.Hash(a).Should().BeEquivalentTo(UrlNormalizer.Hash(b));
    }

    [Fact]
    public void Hash_differs_for_different_normalized_urls()
    {
        UrlNormalizer.TryNormalize("https://example.com/x", out var a).Should().BeTrue();
        UrlNormalizer.TryNormalize("https://example.com/y", out var b).Should().BeTrue();
        UrlNormalizer.Hash(a).Should().NotBeEquivalentTo(UrlNormalizer.Hash(b));
    }

    [Fact]
    public void Equivalent_inputs_produce_same_hash()
    {

        var inputs = new[]
        {
            "https://www.Example.com/Path/?utm_source=x&id=42#frag",
            "https://example.com/Path?id=42",
            "https://EXAMPLE.com/Path/?id=42&fbclid=abc",
            "https://www.example.com:443/Path?id=42#"
        };

        var hashes = inputs.Select(u =>
        {
            UrlNormalizer.TryNormalize(u, out var n).Should().BeTrue();
            return Convert.ToHexString(UrlNormalizer.Hash(n));
        }).Distinct().ToList();

        hashes.Should().HaveCount(1, "все четыре URL семантически одинаковы и должны хэшироваться одинаково");
    }

    [Fact]
    public void Hash_returns_32_bytes_sha256()
    {
        UrlNormalizer.TryNormalize("https://example.com/x", out var n).Should().BeTrue();
        UrlNormalizer.Hash(n).Should().HaveCount(32);
    }

    [Theory]

    [InlineData("https://www.youtube.com/watch?v=ABC&pp=foo&index=2", "https://youtube.com/watch?v=ABC")]
    [InlineData("https://youtube.com/watch?v=ABC&list=PL1&pp=zzz", "https://youtube.com/watch?v=ABC")]
    [InlineData("https://m.youtube.com/watch?v=ABC&feature=share", "https://m.youtube.com/watch?v=ABC")]
    [InlineData("https://www.youtube.com/watch?v=ABC&t=42&ab_channel=foo", "https://youtube.com/watch?v=ABC")]

    [InlineData("https://youtu.be/ABC?t=42&si=xyz", "https://youtu.be/ABC")]

    [InlineData("https://music.youtube.com/watch?v=ABC&t=10", "https://music.youtube.com/watch?v=ABC")]

    [InlineData("https://www.youtube.com/playlist?list=PL1&pbjreload=10", "https://youtube.com/playlist?list=PL1")]

    [InlineData("https://www.google.com/search?q=hello&ie=UTF-8&oq=hello&sourceid=chrome", "https://google.com/search?q=hello")]
    [InlineData("https://google.de/search?q=hello&hl=de", "https://google.de/search?q=hello")]
    public void Site_specific_allowlist(string input, string expected)
    {
        UrlNormalizer.TryNormalize(input, out var actual).Should().BeTrue();
        actual.Should().Be(expected);
    }

    [Fact]
    public void Same_youtube_video_with_different_extra_params_hashes_identically()
    {

        var visited = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&pp=ygUFcmljaw%3D%3D";
        var inFeed = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDGMEM&index=3&pp=somethingelse";

        UrlNormalizer.TryNormalize(visited, out var a).Should().BeTrue();
        UrlNormalizer.TryNormalize(inFeed, out var b).Should().BeTrue();
        Convert.ToHexString(UrlNormalizer.Hash(a)).Should().Be(Convert.ToHexString(UrlNormalizer.Hash(b)));
    }
}
