/**
 * globalSetup — make the two things this gate needs true, or say plainly which
 * one is missing. Nothing here is silent and nothing here is automatic.
 *
 *  1. A RUNNING APP on the base URL. The sandbox route's CSP ends in
 *     `frame-ancestors <app origin>`, so the host page must be served from that
 *     same origin — there is no file:// shortcut and no second server.
 *  2. THE WITNESS PAGE. It is S3's instrument
 *     (`pnpm witness:kind-sandbox-parity`) and it is regenerated here rather
 *     than reinvented: one page, gate OFF in the left column and a real
 *     `<iframe src="/kind-sandbox" sandbox="allow-scripts">` in the right,
 *     both mounting the SAME live organization-authored body with live
 *     `content_ir.kind_instance` data. Reading it from the live corpus every
 *     run is the point — a boundary proven against a fixture is proven against
 *     nothing.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

async function main(): Promise<void> {
    const baseURL = process.env.MATRX_SANDBOX_BASE_URL ?? "http://localhost:3000";

    let status = 0;
    try {
        const response = await fetch(`${baseURL}/kind-sandbox`);
        status = response.status;
    } catch {
        status = 0;
    }
    if (status !== 200) {
        throw new Error(
            `The app is not answering at ${baseURL} (GET /kind-sandbox returned ${
                status || "nothing"
            }).\n` +
                `This gate drives a REAL sandbox frame, and the sandbox route's CSP only\n` +
                `allows the app's own origin to embed it — so there is no way to run it\n` +
                `without the app.\n\n` +
                `Start it with:  pnpm preview:start\n` +
                `Or point this gate at a running one:  MATRX_SANDBOX_BASE_URL=http://localhost:3001\n`,
        );
    }

    execFileSync(
        "npx",
        ["tsx", "features/content-ir/sandbox/make-parity-witness.ts"],
        { cwd: ROOT, stdio: "inherit" },
    );
}

export default main;
