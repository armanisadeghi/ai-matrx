/**
 * @jest-environment node
 */
/**
 * Live probe of the REAL route handler.
 *
 * 🚨 THIS FILE EXISTS BECAUSE UNIT TESTS LIED. An earlier version of the guard
 * passed 36 unit tests while the route still ATTEMPTED to connect to
 * 169.254.169.254 — the unit tests called `guardedLookup` directly, but Node
 * skips DNS for IP literals, so the dispatcher never invoked it. Only a probe
 * through the actual handler caught that.
 *
 * Never replace these with mocks of undici. The point is that the real request
 * path refuses.
 */

import { NextRequest } from "next/server";

import { GET } from "./route";

const call = (url: string) =>
  GET(new NextRequest(`https://app.test/api/image-proxy?url=${encodeURIComponent(url)}`));

jest.setTimeout(30_000);

describe("SSRF targets are refused, not attempted", () => {
  test.each([
    ["http://169.254.169.254/latest/meta-data/", "cloud instance credentials"],
    ["http://127.0.0.1:3000/", "loopback"],
    ["http://[::1]:3000/", "IPv6 loopback"],
    ["http://10.0.0.1/", "RFC1918"],
    ["http://192.168.1.1/", "RFC1918"],
    ["http://[::ffff:169.254.169.254]/", "IPv4-mapped metadata"],
    ["http://0.0.0.0/", "this network"],
  ])("refuses %s (%s)", async (url) => {
    const res = await call(url);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("That address cannot be proxied");
  });

  test.each([
    ["file:///etc/passwd", "local file read"],
    ["ftp://example.com/x.png", "non-http scheme"],
  ])("refuses %s (%s)", async (url) => {
    expect((await call(url)).status).toBe(403);
  });

  it("refuses a hostname that resolves to loopback", async () => {
    const res = await call("http://localhost:3000/");
    expect(res.status).toBe(403);
  });

  it("does not distinguish a blocked range from a dead host", async () => {
    // Identical bodies, or this is a port scanner with a friendly API.
    const a = await call("http://169.254.169.254/");
    const b = await call("http://10.0.0.1/");
    expect(await a.text()).toBe(await b.text());
  });
});

describe("legitimate use still works", () => {
  const REAL_IMAGE =
    "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";

  it("proxies a real public image with the caching headers callers rely on", async () => {
    const res = await call(REAL_IMAGE);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
    expect(res.headers.get("cache-control")).toContain("max-age=900");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("rejects a non-image so this cannot become a general content proxy", async () => {
    const res = await call("https://example.com/");
    expect(res.status).toBe(415);
  });
});
