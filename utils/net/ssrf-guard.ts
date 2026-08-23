/**
 * utils/net/ssrf-guard.ts
 *
 * THE address allow/deny decision for any server-side fetch of a URL a CALLER
 * supplied. One place, so there is never a second half-remembered list of
 * private ranges.
 *
 * WHY THIS EXISTS. `app/api/image-proxy/route.ts` did `fetch(searchParams.get('url'))`
 * with no validation. That is a server-side request forgery hole: anyone could
 * hand our own domain a URL and have our server fetch it and return the bytes.
 * The high-value targets are never on the public internet — they are
 * `http://169.254.169.254/latest/meta-data/` (cloud instance credentials),
 * `http://127.0.0.1:<port>` (anything bound to loopback), and RFC-1918 hosts
 * reachable from the runtime but not from outside.
 *
 * TWO THINGS MAKE THIS ACTUALLY SAFE, AND BOTH ARE LOAD-BEARING:
 *
 * 1. **Validation happens at CONNECT time, not parse time.** `guardedLookup`
 *    is handed to undici's socket factory, so the address we approve is the
 *    address the socket uses. Validating a hostname up-front and then calling
 *    `fetch(hostname)` is NOT equivalent — an attacker's DNS server can answer
 *    once with a public IP (passing the check) and again with 169.254.169.254
 *    milliseconds later, when the real connection is made. That is DNS
 *    rebinding, and a parse-time check does nothing against it.
 *
 * 2. **Every redirect hop goes through the same dispatcher.** A URL on a
 *    perfectly ordinary public host can 302 to `http://169.254.169.254/`. Any
 *    guard that only inspects the URL the caller passed is bypassed by one
 *    redirect.
 *
 * 🚨 If you are reusing this: do not "simplify" it into a pre-flight check.
 * The connect-time binding IS the guarantee.
 */

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";

/** Reserved/private IPv4 ranges, as [first octet-matching predicate]. */
function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable → refuse, never assume safe
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — CLOUD METADATA lives here
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a === 192 && b === 0) return true; // 192.0.0/24 IETF + 192.0.2/24 TEST-NET-1
  if (a === 192 && b === 88) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + broadcast

  return false;
}

function isBlockedIPv6(address: string): boolean {
  const addr = address.toLowerCase().split("%")[0]; // strip zone index

  // IPv4-mapped (::ffff:1.2.3.4) and IPv4-compatible — unwrap and judge as v4,
  // otherwise ::ffff:169.254.169.254 walks straight through an IPv6-only check.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  // 🚨 The SAME address in HEX form. `new URL()` normalises
  // `[::ffff:169.254.169.254]` to `[::ffff:a9fe:a9fe]`, so the dotted regex
  // above never sees it. A live probe against the real route caught this
  // returning 502 (connection attempted) instead of 403 (refused).
  const mappedHex = addr.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedIPv4(
      `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
    );
  }

  if (addr === "::" || addr === "::1") return true; // unspecified / loopback
  if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  if (/^ff/.test(addr)) return true; // ff00::/8 multicast
  if (addr.startsWith("64:ff9b:")) return true; // NAT64 — can embed private v4
  if (addr.startsWith("2002:")) return true; // 6to4 — can embed private v4

  return false;
}

/** True when this literal address must never be connected to. */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true; // not an IP at all → refuse
}

export class BlockedAddressError extends Error {
  constructor(host: string) {
    // Deliberately vague to the caller; the detail stays server-side. Telling a
    // prober WHICH internal range it hit is free reconnaissance.
    super(`Refusing to connect to a non-public address for host "${host}"`);
    this.name = "BlockedAddressError";
  }
}

/**
 * A `net.LookupFunction` for undici's `connect` options. Resolves the hostname
 * and refuses if ANY returned address is non-public.
 *
 * ALL addresses must pass, not just the one we would use: a round-robin record
 * mixing a public IP with 127.0.0.1 would otherwise be a coin flip.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  // A literal IP in the URL never reaches DNS — judge it directly.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      callback(new BlockedAddressError(hostname), []);
      return;
    }
  }

  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, []);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (list.length === 0) {
      callback(new BlockedAddressError(hostname), []);
      return;
    }
    for (const entry of list) {
      if (isBlockedAddress(entry.address)) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }
    }
    callback(null, list as LookupAddress[]);
  });
}

/** Only these schemes may ever be fetched on a caller's behalf. */
export function isAllowedProtocol(url: URL): boolean {
  // file:, gopher:, ftp:, data: — every one of these has been an SSRF primitive.
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Parse-time verdict for ONE url. Required in addition to `guardedLookup`.
 *
 * 🚨 WHY BOTH ARE NEEDED — this was found by live probe, not by reasoning:
 * Node skips DNS resolution entirely when the host is already an IP literal, so
 * `guardedLookup` is NEVER CALLED for `http://169.254.169.254/`. With only the
 * connect-time guard in place, a live probe reached the metadata address
 * (`ConnectTimeoutError … attempted address: 169.254.169.254:80`) — attempted,
 * not refused. Hostnames need the connect-time guard (rebinding); literals need
 * this one. Neither covers the other.
 *
 * Literals cannot rebind — there is no DNS step to race — so checking here is
 * sufficient for them.
 */
export function isUrlSafeToFetch(url: URL): boolean {
  if (!isAllowedProtocol(url)) return false;
  // URL wraps IPv6 literals in brackets; isIP wants them bare.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) return false;
  return true;
}
