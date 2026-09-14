/**
 * check:kind-sandbox-gate — THE SHAPE SANDBOX'S OWN AUTOMATIC GATE. (DD-242)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS. Until 2026-09-14 the sandbox's real-browser proof
 * (`test:kind-sandbox:browser`) — the ONLY evidence that nothing reaches the
 * network from inside an organization-authored component's frame, that every
 * refusal is named as a CSP violation, and that the frame's origin is opaque —
 * lived in NO release gate, NO CI job and NO hook. Its own header said why: it
 * needs a running app, a browser, and a live witness page, "cost that belongs
 * on the sandbox's own gate". That gate was never built, so the strongest proof
 * in the subsystem ran only when a person happened to type it, on a machine
 * that happened to be holding the single shared dev-server lease. B-95 could
 * not run it at all for that reason, and step 2 of the DD-123 rollout went out
 * with its parity witness UNKNOWN. A proof nobody runs is a comment.
 *
 * WHAT IT DOES, in order, printing ONE honest line per proof:
 *
 *   1  POLICY SOURCE     `/kind-sandbox`'s policy is the route handler's, and
 *                        nothing else in the request path rewrites it.
 *   2  LIVE PARITY       the policy this gate drives is, origin for origin, the
 *                        policy production is serving right now. Unreachable
 *                        network = UNMEASURED and a finding, never a pass.
 *   3  PROTOCOL          `check:kind-sandbox-protocol` (static).
 *   4  SAFELIST          `check:kind-sandbox-safelist` (live corpus).
 *   5  BROWSER PROOF     `test:kind-sandbox:browser` against a server THIS
 *                        SCRIPT boots on a port the OS hands out, with the
 *                        witness regenerated in-run from live rows.
 *
 * THE SERVER IS NOT `next dev`, ON PURPOSE — `features/content-ir/sandbox/browser/
 * gate-server.ts` carries the full argument and the measurements. Step 2 is what
 * keeps that choice honest: if anything in the real runtime ever starts changing
 * this response, the two policies stop matching and this gate fails by name.
 *
 * COST. MEASURED 13.4 s wall end to end on a warm checkout (2026-09-14), of
 * which the two browser tests are 9.9 s. That is cheaper than most gates already
 * in the release list — `type-check` is minutes and the whole jest suite is
 * ~221 s — so it carries its weight per release, and it is never per-commit.
 *
 *   pnpm check:kind-sandbox-gate
 *   pnpm check:kind-sandbox-gate --self-test    (proves this script can fail)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { startGateServer, type GateServer } from "../features/content-ir/sandbox/browser/gate-server";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = path.resolve(__dirname, "..");
const ROUTE_FILE = path.join(ROOT, "app/kind-sandbox/route.ts");
const BUNDLE = path.join(ROOT, "public/kind-sandbox.js");
const SHEET = path.join(ROOT, "public/kind-sandbox.css");
/** Where the world reads the same route from. */
const PRODUCTION = "https://www.aimatrx.com/kind-sandbox";

const findings: string[] = [];

function pass(line: string): void {
    console.log(`✅ ${line}`);
}

function fail(line: string, remedy: string): void {
    console.log(`❌ ${line}`);
    console.log(`   Fix: ${remedy}`);
    findings.push(line);
}

/** A policy with its own origin replaced, so two origins can be compared. */
function normalizePolicy(policy: string, origin: string): string {
    return policy.split(origin).join("<origin>").replace(/\s+/g, " ").trim();
}

// ── 1. the policy this gate drives is the policy the route handler writes ────
//
// The gate serves `app/kind-sandbox/route.ts` directly. That is only the whole
// truth while nothing else in the request path rewrites the response, so this
// asserts the two places that could: the proxy and the Next header config.
function checkPolicySource(): void {
    const proxy = path.join(ROOT, "proxy.ts");
    const headers = path.join(ROOT, "utils/next-config/headers.js");
    const sources = [proxy, headers].filter(existsSync);
    const rewriters = sources.filter((file) => {
        const body = readFileSync(file, "utf8");
        const live = body
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
            .join("\n");
        return /Content-Security-Policy/i.test(live) || /kind-sandbox/.test(live);
    });
    if (rewriters.length > 0) {
        fail(
            `POLICY SOURCE — ${rewriters.map((f) => path.relative(ROOT, f)).join(", ")} now mentions ` +
                `a Content-Security-Policy or /kind-sandbox. This gate serves the route handler ` +
                `alone, so its policy may no longer be the one the app serves.`,
            "read that file, and if it really does shape the sandbox response, teach gate-server.ts " +
                "to run it too — never leave the gate measuring a policy the app no longer sends.",
        );
        return;
    }
    if (!existsSync(ROUTE_FILE)) {
        fail(
            `POLICY SOURCE — ${path.relative(ROOT, ROUTE_FILE)} does not exist.`,
            "point gate-server.ts at the route's new home.",
        );
        return;
    }
    pass(
        "POLICY SOURCE — /kind-sandbox's Content-Security-Policy comes from app/kind-sandbox/route.ts " +
            "alone; neither proxy.ts nor the Next header config touches it.",
    );
}

// ── 2. the same policy the world is served ──────────────────────────────────
async function checkLiveParity(server: GateServer): Promise<void> {
    let response: Response;
    try {
        response = await fetch(PRODUCTION, { signal: AbortSignal.timeout(20_000) });
    } catch (error) {
        fail(
            `LIVE PARITY — UNMEASURED: ${PRODUCTION} could not be read (${String(error)}). ` +
                `Nothing was checked; that is NOT a pass.`,
            "re-run with network access. The gate deliberately refuses to certify a policy it " +
                "cannot compare against the one production is actually serving.",
        );
        return;
    }
    const live = response.headers.get("content-security-policy") ?? "";
    if (response.status !== 200 || !live) {
        fail(
            `LIVE PARITY — production answered ${response.status} with ` +
                `${live ? "a policy" : "NO Content-Security-Policy"} on ${PRODUCTION}.`,
            "the deployed sandbox frame is unprotected or gone — treat as an incident, not a gate bug.",
        );
        return;
    }
    const here = normalizePolicy(server.policy, server.origin);
    const there = normalizePolicy(live, new URL(PRODUCTION).origin);
    if (here !== there) {
        fail(
            "LIVE PARITY — the policy this gate drives is NOT the policy production serves.\n" +
                `   gate:       ${here}\n` +
                `   production: ${there}`,
            "if HEAD legitimately changed the policy, this clears once the deploy lands; otherwise " +
                "something in the real runtime is rewriting the sandbox response and gate-server.ts " +
                "must learn about it.",
        );
        return;
    }
    pass(
        `LIVE PARITY — the policy under test is, origin for origin, the one ${PRODUCTION} is ` +
            `serving right now (connect-src 'none', frame-ancestors <origin>).`,
    );
}

// ── 3-5. the runnable proofs ────────────────────────────────────────────────
/**
 * ASYNCHRONOUS ON PURPOSE. The gate server runs in THIS process, so a
 * `spawnSync` would block the event loop and the server would accept no
 * connection for as long as the child ran — the browser proof then fails with
 * "no app is answering", which is a lie about the boundary. (Measured here
 * 2026-09-14, first run of this gate.)
 */
async function runCommand(
    label: string,
    script: string,
    env: Record<string, string> = {},
): Promise<boolean> {
    console.log(`\n── ${label} ──`);
    const child = spawn("pnpm", [script], {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, ...env },
    });
    return new Promise<boolean>((resolve) => {
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
    });
}

function ensureBundle(): boolean {
    if (existsSync(BUNDLE) && existsSync(SHEET)) return true;
    console.log(
        "\n── the sandbox bundle is not built here; building it (pnpm build:kind-sandbox) ──",
    );
    const built = spawnSync("pnpm", ["build:kind-sandbox"], { cwd: ROOT, stdio: "inherit" });
    return built.status === 0 && existsSync(BUNDLE) && existsSync(SHEET);
}

/**
 * --self-test — this script has logic of its own (the two policy comparisons),
 * so it must be able to prove that logic can still fail. Both planted REDs are
 * in memory: no file in the working tree is touched, because a peer sweeper
 * commits whatever is on disk the moment a lane dies.
 */
function selfTest(): never {
    const origin = "http://127.0.0.1:9";
    const real =
        "default-src 'none'; script-src http://127.0.0.1:9 'unsafe-eval'; connect-src 'none'";
    const loosened = real.replace("connect-src 'none'", "connect-src *");
    const reds: string[] = [];

    if (normalizePolicy(real, origin) === normalizePolicy(loosened, origin)) {
        reds.push("a loosened connect-src compared EQUAL to the real policy");
    } else {
        console.log("✅ RED 1 — a loosened connect-src is seen as a different policy.");
    }

    const otherOrigin = "https://www.aimatrx.com";
    const sameShape = real.split(origin).join(otherOrigin);
    if (normalizePolicy(real, origin) !== normalizePolicy(sameShape, otherOrigin)) {
        reds.push("the same policy at two origins compared UNEQUAL — every run would fail");
    } else {
        console.log("✅ RED 2 — the same policy at two different origins compares equal.");
    }

    if (reds.length > 0) {
        for (const red of reds) console.log(`❌ ${red}`);
        exitAfterDrain(1);
    }
    console.log("\nThe gate's own comparison logic can still fail. 2/2 planted REDs caught.");
    exitAfterDrain(0);
}

async function main(): Promise<never> {
    if (process.argv.includes("--self-test")) selfTest();

    console.log("\nTHE SHAPE SANDBOX GATE (DD-242) — five proofs, one line each.\n");
    const started = Date.now();

    checkPolicySource();

    if (!ensureBundle()) {
        fail(
            "BUNDLE — public/kind-sandbox.js / .css could not be built, so there is nothing for " +
                "the frame to load.",
            "pnpm build:kind-sandbox",
        );
        report(started);
    }

    let server: GateServer | null = null;
    try {
        server = await startGateServer();
        console.log(
            `\n[kind-sandbox gate] serving the real route handler on ${server.origin} ` +
                `(port chosen by the OS — never the shared preview's 3001, never a port a peer holds)`,
        );

        await checkLiveParity(server);

        if (!(await runCommand("PROTOCOL (static)", "check:kind-sandbox-protocol"))) {
            fail(
                "PROTOCOL — the sandbox protocol guard failed (see its report above).",
                "read the guard's own remedy line.",
            );
        } else {
            pass("PROTOCOL — the gate is read at one mount and every message type is asserted.");
        }

        if (!(await runCommand("SAFELIST (live corpus)", "check:kind-sandbox-safelist"))) {
            fail(
                "SAFELIST — the Tailwind safelist no longer matches the live component bodies, so " +
                    "classes an author has used produce no CSS.",
                "pnpm gen:kind-sandbox-safelist, then commit the regenerated file.",
            );
        } else {
            pass("SAFELIST — the generated class safelist matches the live corpus.");
        }

        if (
            !(await runCommand("BROWSER PROOF (real Chromium)", "test:kind-sandbox:browser", {
                MATRX_SANDBOX_BASE_URL: server.origin,
            }))
        ) {
            fail(
                "BROWSER PROOF — the real-browser boundary spec failed: one of zero-outbound, " +
                    "refusal-by-name, opaque-origin or a permanent RED control did not hold.",
                "read the spec output above — it names the probe and the directive.",
            );
        } else {
            pass(
                "BROWSER PROOF — a live component rendered in the frame, reached nothing, was " +
                    "refused by name, and the gate-OFF controls still fired.",
            );
        }
    } catch (error) {
        fail(`GATE — the gate could not run: ${String(error)}`, "read the error above.");
    } finally {
        // Every exit path tears the server down, including a throw and a signal.
        if (server) await server.close();
    }

    report(started);
}

function report(started: number): never {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log("");
    if (findings.length > 0) {
        console.log(
            `THE SHAPE SANDBOX GATE FAILED — ${findings.length} finding(s) in ${seconds}s. The ` +
                `sandbox boundary is what stands between an organization-authored component and ` +
                `every other organization's data; a red here is not a style nit.`,
        );
        exitAfterDrain(1);
    }
    console.log(`THE SHAPE SANDBOX GATE PASSED — five proofs, ${seconds}s.`);
    exitAfterDrain(0);
}

// An interrupt is an exit path too: the server lives in THIS process, so
// leaving through exitAfterDrain closes its listener with it — no orphan port.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        console.log(`\n[kind-sandbox gate] ${signal} — tearing the gate server down.`);
        exitAfterDrain(130);
    });
}

void main();
