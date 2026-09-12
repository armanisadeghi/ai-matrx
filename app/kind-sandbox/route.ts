/**
 * GET /kind-sandbox — the document every organization-authored Shape component
 * renders inside (DD-123 §1.3).
 *
 * It is a Next ROUTE HANDLER, not a page, because the whole point is the
 * response HEADER: a `<meta http-equiv>` CSP cannot express `frame-ancestors`
 * and is applied after the parser has already started, so the policy has to
 * arrive with the bytes.
 *
 * WHAT THE DOCUMENT IS: a `<div id="root">`, the sandbox stylesheet and the
 * sandbox bundle. Nothing else — no app shell, no Next runtime, no data. The
 * bundle (`public/kind-sandbox.js`, built by `pnpm build:kind-sandbox`) is the
 * frame's entire world, because `connect-src 'none'` means it can never fetch
 * anything at runtime.
 *
 * WHY THE CSP NAMES THE ORIGIN INSTEAD OF `'self'` (§1.3 deviation 1). The
 * host embeds this URL with `sandbox="allow-scripts"` and deliberately WITHOUT
 * `allow-same-origin`, so the frame's execution origin is OPAQUE. `'self'`
 * resolves to that opaque origin and would match nothing — not even the script
 * this document is required to load. So every source that must work is written
 * as the app's absolute origin, taken from the request.
 *
 * `'unsafe-eval'` (§1.3 deviation 2, chair ruling 3) is required because an
 * organization-authored body is executed with `new Function`. It buys an
 * attacker nothing here: with `connect-src 'none'`, `form-action 'none'`,
 * `img-src` restricted to data/blob plus the platform's own image door, and no
 * same-origin reach, an evaluator inside this frame has nothing to reach and
 * nowhere to send anything.
 *
 * `img-src` (chair ruling 2) is `data: blob:` plus `/api/image-proxy` — the
 * platform's own image door, path-exact — and NOTHING else. A remote
 * `<img src>` is the exfiltration channel the V-17 F2 probe proved, so it is
 * closed here and a remote image goes through the proxy.
 */
import type { NextRequest } from "next/server";

/** The frame must never be statically cached with a stale policy. */
export const dynamic = "force-dynamic";

/**
 * The app's absolute origin as the BROWSER sees it. Behind Vercel the request
 * URL is internal, so the forwarded headers win when present.
 */
function appOrigin(request: NextRequest): string {
    const headers = request.headers;
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    if (!host) return request.nextUrl.origin;
    const proto =
        headers.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
            ? "http"
            : "https");
    return `${proto}://${host}`;
}

function contentSecurityPolicy(origin: string): string {
    return [
        "default-src 'none'",
        `script-src ${origin} 'unsafe-eval'`,
        `style-src 'unsafe-inline' ${origin}`,
        `img-src data: blob: ${origin}/api/image-proxy`,
        `font-src data: ${origin}`,
        "connect-src 'none'",
        "form-action 'none'",
        `frame-ancestors ${origin}`,
        "base-uri 'none'",
    ].join("; ");
}

const DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shape component sandbox</title>
<link rel="stylesheet" href="/kind-sandbox.css">
<script src="/kind-sandbox.js"></script>
</head>
<body>
<div id="root"></div>
</body>
</html>
`;

export async function GET(request: NextRequest): Promise<Response> {
    const origin = appOrigin(request);
    return new Response(DOCUMENT, {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": contentSecurityPolicy(origin),
            // The document is tiny and the policy is per-origin; the BUNDLE is
            // what caches. Revalidating the shell keeps a policy change live.
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        },
    });
}
