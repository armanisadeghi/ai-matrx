/**
 * Where the app actually is.
 *
 * This is a SHARED checkout: the agent preview is normally on :3001
 * (`pnpm preview:start`), a plain `pnpm dev` lands on :3000, and either may be
 * the one that is up right now. Hard-coding a port makes this gate fail for a
 * reason that has nothing to do with the boundary under test, so it asks.
 *
 * It never starts a server. A second dev server in this checkout fights the
 * first for the port, the Turbopack cache and the install lock — the harness
 * that exists for that reason is `pnpm preview:start`.
 */
import { execFileSync } from "node:child_process";

const CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

function answers(origin: string): boolean {
    try {
        const code = execFileSync(
            "curl",
            ["-s", "-o", "/dev/null", "-m", "4", "-w", "%{http_code}", `${origin}/kind-sandbox`],
            { encoding: "utf8" },
        ).trim();
        return code === "200";
    } catch {
        return false;
    }
}

/** The origin serving `/kind-sandbox`, or null when nothing is. */
export function resolveBaseURL(): string | null {
    const declared = process.env.MATRX_SANDBOX_BASE_URL;
    if (declared) return answers(declared) ? declared : null;
    return CANDIDATES.find(answers) ?? null;
}

export const NO_APP_SENTENCE =
    `No app is answering GET /kind-sandbox on ${CANDIDATES.join(" or ")}.\n` +
    `This gate drives a REAL sandbox frame, and the sandbox route's CSP only allows\n` +
    `the app's own origin to embed it — so there is no way to run it without the app.\n\n` +
    `Start it with:  pnpm preview:start\n` +
    `Or name a running one:  MATRX_SANDBOX_BASE_URL=http://localhost:3002 pnpm test:kind-sandbox:browser\n`;
