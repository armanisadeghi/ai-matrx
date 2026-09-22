/**
 * Playwright-only server discovery. This is test infrastructure, never a
 * product runtime setting or a customer-facing readiness timeout.
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
import { formatDurationMs } from "@ai-matrx/kit/format";
import { execFileSync } from "node:child_process";

const CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

/** How long a DECLARED origin is given to start answering (each probe is a 4 s curl). */
const WAIT_MS = 30_000;

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

/**
 * The origin serving `/kind-sandbox`, or null when nothing is.
 *
 * A DECLARED origin is WAITED FOR, briefly. `pnpm check:kind-sandbox-gate`
 * (DD-242) boots its own server on a port the OS hands out and passes that
 * origin in `MATRX_SANDBOX_BASE_URL`; the very first probe can lose the race
 * with the listener, and a gate that fails because it asked one moment too
 * early would be the same "it only runs on a machine" failure this gate exists
 * to end. An UNdeclared origin is never waited for — nobody is starting one.
 */
export function resolveBaseURL(): string | null {
    const declared = process.env.MATRX_SANDBOX_BASE_URL;
    if (declared) {
        const deadline = Date.now() + WAIT_MS;
        do {
            if (answers(declared)) return declared;
        } while (Date.now() < deadline);
        return null;
    }
    return CANDIDATES.find(answers) ?? null;
}

/**
 * The refusal, naming what was actually tried. A declared origin that never
 * answered is a DIFFERENT fact from "no server anywhere", and reporting the
 * second when the first happened is how the gate's own first run misread
 * itself as a missing app (2026-09-14).
 */
export function noAppSentence(): string {
    const declared = process.env.MATRX_SANDBOX_BASE_URL;
    const where = declared
        ? `The origin named in MATRX_SANDBOX_BASE_URL (${declared}) never answered GET /kind-sandbox\nwithin ${formatDurationMs(WAIT_MS, { style: "compact" })}.`
        : `No app is answering GET /kind-sandbox on ${CANDIDATES.join(" or ")}.`;
    return (
        `${where}\n` +
        `This gate drives a REAL sandbox frame, and the sandbox route's CSP only allows\n` +
        `the app's own origin to embed it — so there is no way to run it without the app.\n\n` +
        `Start it with:  pnpm preview:start\n` +
        `Or name a running one:  MATRX_SANDBOX_BASE_URL=http://localhost:3002 pnpm test:kind-sandbox:browser\n` +
        `Or let the gate boot its own server and run this for you:  pnpm check:kind-sandbox-gate\n`
    );
}
