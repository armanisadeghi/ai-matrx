/**
 * The address guard is the whole reason /api/image-proxy is safe to expose.
 *
 * The route it protects is PUBLIC and UNAUTHENTICATED by design (it renders
 * third-party images on public surfaces). That makes the `?url=` parameter
 * hostile input from a stranger, and before this guard existed the route did
 * `fetch(searchParams.get('url'))` — handing anyone our server as a fetcher for
 * cloud metadata, loopback services, and the private network.
 *
 * If a test here fails, do NOT relax it.
 */

import {
  BlockedAddressError,
  guardedLookup,
  isAllowedProtocol,
  isBlockedAddress,
} from "./ssrf-guard";

describe("isBlockedAddress", () => {
  // The ones that actually get exploited, named so nobody "cleans up" the list.
  test.each([
    ["169.254.169.254", "AWS/GCP/Azure instance metadata — the crown jewels"],
    ["127.0.0.1", "loopback"],
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "RFC1918"],
    ["172.16.0.1", "RFC1918 lower bound"],
    ["172.31.255.254", "RFC1918 upper bound"],
    ["192.168.1.1", "RFC1918"],
    ["100.64.0.1", "CGNAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ])("blocks %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    ["::1", "IPv6 loopback"],
    ["fd00::1", "unique-local"],
    ["fe80::1", "link-local"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata — the classic bypass"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    // new URL() normalises the two above into THESE. Caught by live probe.
    ["::ffff:a9fe:a9fe", "IPv4-mapped metadata, hex form"],
    ["::ffff:7f00:1", "IPv4-mapped loopback, hex form"],
    ["::ffff:c0a8:101", "IPv4-mapped 192.168.1.1, hex form"],
    ["64:ff9b::a01:101", "NAT64-wrapped private v4"],
  ])("blocks %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    "8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700::1111",
    "::ffff:808:808", // 8.8.8.8 mapped — public stays public
  ])(
    "allows public address %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  test.each(["not-an-ip", "", "999.999.999.999", "10.1", "javascript:alert(1)"])(
    "refuses non-address %s rather than assuming it is safe",
    (value) => {
      expect(isBlockedAddress(value)).toBe(true);
    },
  );
});

describe("isAllowedProtocol", () => {
  test.each(["http://example.com/a.png", "https://example.com/a.png"])(
    "allows %s",
    (u) => expect(isAllowedProtocol(new URL(u))).toBe(true),
  );

  test.each([
    "file:///etc/passwd",
    "ftp://example.com/a.png",
    "data:image/png;base64,AAAA",
    "gopher://example.com/",
  ])("blocks %s", (u) => expect(isAllowedProtocol(new URL(u))).toBe(false));
});

describe("guardedLookup", () => {
  const lookup = (host: string) =>
    new Promise<{ err: Error | null; addresses: unknown }>((resolve) => {
      guardedLookup(host, {} as never, (err, addresses) =>
        resolve({ err: err ?? null, addresses }),
      );
    });

  it("refuses a literal internal IP without ever touching DNS", async () => {
    const { err } = await lookup("169.254.169.254");
    expect(err).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses literal loopback", async () => {
    const { err } = await lookup("127.0.0.1");
    expect(err).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses a hostname that resolves to loopback", async () => {
    // `localhost` resolves internally on every platform — no network needed.
    const { err } = await lookup("localhost");
    expect(err).toBeInstanceOf(BlockedAddressError);
  });

  it("is a typed error the route can catch and answer generically", async () => {
    // The message names the host on purpose — it goes to SERVER logs, and the
    // caller supplied that host anyway so it reveals nothing new. What must
    // never reach the client is WHY: the route catches BlockedAddressError and
    // answers a flat "That address cannot be proxied", so a prober cannot tell
    // a blocked range from a dead host and use this as a port scanner.
    const { err } = await lookup("169.254.169.254");
    expect(err).toBeInstanceOf(BlockedAddressError);
    expect(err?.name).toBe("BlockedAddressError");
  });
});
