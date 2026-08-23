// app/api/image-proxy/route.ts
//
// Proxies an EXTERNAL image so the browser can display it without CORS /
// cross-origin-embedding trouble. Public by design — it is used to render
// third-party images (scraped pages, search results) on public surfaces, so it
// is deliberately NOT auth-gated.
//
// 🚨 PUBLIC AND UNAUTHENTICATED MEANS THE URL IS HOSTILE INPUT.
// This route used to be exactly this:
//
//     const imageUrl = searchParams.get('url');
//     const response = await fetch(imageUrl);
//
// That is a server-side request forgery hole. Our server would fetch ANY URL a
// stranger supplied and hand back the bytes — including
// `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (cloud
// instance credentials), anything on `127.0.0.1`, and every RFC-1918 host the
// runtime can reach but the internet cannot.
//
// Four things keep it closed. Removing ANY of them reopens the hole:
//
//   1. http/https only            — file:/gopher:/data: are SSRF primitives.
//   2. connect-time address guard — see utils/net/ssrf-guard.ts. Validation is
//      bound to the socket, so DNS rebinding cannot slip an internal address in
//      between the check and the connection.
//   3. redirects through the SAME dispatcher — a public URL can 302 to
//      169.254.169.254; every hop is re-validated, and the chain is capped.
//   4. it must actually be an image, and a bounded one — otherwise this is a
//      general-purpose content proxy wearing an image costume.
//
// Errors never echo the upstream body or reason: telling a prober what it hit
// turns this into a port scanner with a nice JSON API.

import { NextRequest, NextResponse } from "next/server";
import { Agent, request as undiciRequest } from "undici";

import {
  BlockedAddressError,
  guardedLookup,
  isUrlSafeToFetch,
} from "@/utils/net/ssrf-guard";

// Needs the Node runtime: the address guard uses node:dns / node:net.
export const runtime = "nodejs";
// Runtime request params — never prerender.
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB — a page image, not a disk image.
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/**
 * One dispatcher, so every hop uses the guarded lookup for HOSTNAMES.
 *
 * Redirects are followed BY HAND below rather than by undici's interceptor,
 * because each hop's URL must pass `isUrlSafeToFetch` before it is issued — the
 * interceptor gives no hook to inspect intermediate URLs, so a 302 to
 * `http://169.254.169.254/` would skip DNS (literal IP) and skip the guard.
 */
const guardedAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: TIMEOUT_MS },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

function fail(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return fail(400, "Missing image URL");
  }

  let target: URL;
  try {
    target = new URL(imageUrl);
  } catch {
    return fail(400, "Invalid image URL");
  }

  // Covers protocol AND a literal internal IP in the URL the caller supplied —
  // the case that skips DNS and therefore skips guardedLookup entirely.
  if (!isUrlSafeToFetch(target)) {
    return fail(403, "That address cannot be proxied");
  }

  try {
    // Follow redirects by hand, validating EVERY hop before issuing it.
    let current = target;
    let upstream = await undiciRequest(current, {
      dispatcher: guardedAgent,
      method: "GET",
      // Do NOT forward the caller's headers (cookies, Authorization). This
      // request is made by us, as nobody, to a third party.
      headers: { accept: "image/*" },
    });

    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const status = upstream.statusCode;
      if (status < 300 || status > 399) break;
      const location = upstream.headers["location"];
      if (typeof location !== "string" || !location) break;
      upstream.body.dump().catch(() => {});

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return fail(502, "Upstream did not return an image");
      }
      if (!isUrlSafeToFetch(next)) {
        return fail(403, "That address cannot be proxied");
      }
      current = next;
      upstream = await undiciRequest(current, {
        dispatcher: guardedAgent,
        method: "GET",
        headers: { accept: "image/*" },
      });
    }

    if (upstream.statusCode >= 300 && upstream.statusCode <= 399) {
      upstream.body.dump().catch(() => {});
      return fail(502, "Too many redirects");
    }

    if (upstream.statusCode >= 400) {
      upstream.body.dump().catch(() => {});
      return fail(502, "Upstream did not return an image");
    }

    const contentType = String(upstream.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().startsWith("image/")) {
      // Without this, any HTML/JSON/text endpoint the server can reach becomes
      // readable through this route — the SSRF payoff, minus the image.
      upstream.body.dump().catch(() => {});
      return fail(415, "Requested resource is not an image");
    }

    const declared = Number(upstream.headers["content-length"] ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      upstream.body.dump().catch(() => {});
      return fail(413, "Image is too large to proxy");
    }

    // Read with a hard cap — Content-Length can lie or be absent, and
    // `.blob()`/`.arrayBuffer()` would happily buffer a 10GB stream.
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of upstream.body) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        upstream.body.destroy();
        return fail(413, "Image is too large to proxy");
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks, total);

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        // Unchanged from the original route — callers depend on both.
        "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=900",
        "Cross-Origin-Resource-Policy": "cross-origin",
        // Bytes from an arbitrary third party: never let the browser sniff them
        // into something scriptable.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof BlockedAddressError) {
      return fail(403, "That address cannot be proxied");
    }
    // Generic on purpose — a distinguishable timeout vs refused vs DNS-failure
    // response is a working port scanner.
    return fail(502, "Error fetching image");
  }
}
