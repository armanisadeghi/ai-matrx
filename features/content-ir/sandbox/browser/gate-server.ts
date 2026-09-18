/**
 * gate-server — the server `pnpm check:kind-sandbox-gate` boots for itself.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `next dev`, and why that is the honest choice (DD-242).
 *
 * The boundary this gate measures is ONE HTTP response: `GET /kind-sandbox`,
 * its `Content-Security-Policy` header, and the two static artifacts that
 * response names (`/kind-sandbox.js`, `/kind-sandbox.css`). There is no data
 * fetch, no session, no app shell and no Next runtime inside the frame —
 * `connect-src 'none'` means there cannot be.
 *
 * A second `next dev` in this checkout was measured at 18–90 GB RSS for a cold
 * route compile (see the numbers in `scripts/agent-dev-server.sh`), fights the
 * first server for the Turbopack cache and the install lock, and would not
 * survive a 16 GB CI runner. A gate that dies for a reason unrelated to the
 * boundary is the exact failure `base-url.ts` was written to avoid.
 *
 * So this serves THE REAL ROUTE HANDLER — `app/kind-sandbox/route.ts` is
 * IMPORTED, never copied — over a bare Node server on a port the OS hands out.
 * The document, the header and the artifacts are the shipped bytes; what is
 * absent is everything the frame cannot reach anyway.
 *
 * THE CLAIM IS NOT ASSUMED, IT IS CHECKED. `check-kind-sandbox-gate.ts` fetches
 * production's own `/kind-sandbox` and refuses to pass unless the policy this
 * server serves is, origin for origin, the policy the world is served. If
 * `proxy.ts` or a config header ever starts rewriting that response, the two
 * stop matching and the gate says so by name.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

// A test-only static server for the Shape sandbox's real-browser gate
// (`pnpm check:kind-sandbox-gate`). It never enters a Next.js bundle, but its
// root is dynamic, so the trace boundary is declared explicitly — see
// docs/BUILD-TIME-TURBOPACK.md.
const ROOT = path.resolve(/* turbopackIgnore: true */ __dirname, "../../../..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ROUTE_MODULE = path.join(ROOT, "app/kind-sandbox/route.ts");

/** Only what the sandbox document and the witness actually name. */
const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

export interface GateServer {
    /** e.g. `http://127.0.0.1:53127` — the origin the browser is pointed at. */
    origin: string;
    port: number;
    /** The CSP the real handler emitted for this origin, read back once. */
    policy: string;
    close(): Promise<void>;
}

type RouteHandler = (request: unknown) => Promise<Response>;

async function loadRouteHandler(): Promise<RouteHandler> {
    const mod = (await import(ROUTE_MODULE)) as { GET?: RouteHandler };
    if (typeof mod.GET !== "function") {
        throw new Error(
            `${ROUTE_MODULE} exports no GET handler. The Shape sandbox document is that ` +
                `handler's response, so this gate has nothing to drive. If the route moved, ` +
                `point gate-server.ts at its new home — never re-type the document here.`,
        );
    }
    return mod.GET;
}

/** The handler reads `host` / `x-forwarded-host` and `nextUrl.origin`; give it both, honestly. */
function toRouteRequest(req: IncomingMessage, origin: string): unknown {
    const url = `${origin}${req.url ?? "/"}`;
    const request = new Request(url, {
        method: "GET",
        headers: { host: new URL(origin).host },
    }) as Request & { nextUrl: URL };
    Object.defineProperty(request, "nextUrl", { value: new URL(url), writable: false });
    return request;
}

async function servePublicFile(res: ServerResponse, pathname: string): Promise<boolean> {
    // No traversal, ever: resolve and prove the result is still under public/.
    const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);
    if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return false;
    try {
        const info = await stat(resolved);
        if (!info.isFile()) return false;
        res.writeHead(200, {
            "Content-Type": CONTENT_TYPES[path.extname(resolved)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
        });
        await new Promise<void>((resolve, reject) => {
            createReadStream(resolved).on("error", reject).on("end", resolve).pipe(res);
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Boot on a port THE OS PICKS (`listen(0)`), so the gate can never take the
 * shared preview's 3001, a plain `pnpm dev`'s 3000, or any port a peer lane is
 * already holding — an occupied port is not offered.
 */
export async function startGateServer(): Promise<GateServer> {
    const handler = await loadRouteHandler();
    let origin = "";

    const server: Server = createServer((req, res) => {
        void (async () => {
            const pathname = new URL(req.url ?? "/", "http://placeholder").pathname;
            try {
                if (pathname === "/kind-sandbox") {
                    const response = await handler(toRouteRequest(req, origin));
                    const headers: Record<string, string> = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });
                    res.writeHead(response.status, headers);
                    res.end(await response.text());
                    return;
                }
                if (await servePublicFile(res, pathname)) return;
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                res.end(
                    `${pathname} is not served by the Shape sandbox gate. This server answers ` +
                        `GET /kind-sandbox from app/kind-sandbox/route.ts and files under public/ ` +
                        `— nothing else, because nothing else is inside the boundary under test.\n`,
                );
            } catch (error) {
                // Never a silent 500: the gate must be able to say what broke.
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end(`kind-sandbox gate server failed on ${pathname}: ${String(error)}\n`);
            }
        })();
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;

    const probe = await fetch(`${origin}/kind-sandbox`);
    const policy = probe.headers.get("content-security-policy") ?? "";
    if (probe.status !== 200 || !policy) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        throw new Error(
            `The gate's own server answered ${probe.status} with ` +
                `${policy ? "a policy" : "NO Content-Security-Policy"} on ${origin}/kind-sandbox. ` +
                `Nothing downstream of this is worth measuring.`,
        );
    }

    return {
        origin,
        port,
        policy,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections?.();
                server.close(() => resolve());
            }),
    };
}
