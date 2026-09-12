/**
 * globalSetup — regenerate THE WITNESS before the gate runs.
 *
 * The witness is S3's instrument (`pnpm witness:kind-sandbox-parity`), reused
 * rather than reinvented: one page served from the app's own origin, with the
 * SAME live organization-authored body mounted twice — gate OFF straight into
 * the document on the left, and a real
 * `<iframe src="/kind-sandbox" sandbox="allow-scripts">` driven over the real
 * protocol on the right. Both columns carry live `content_ir.kind_instance`
 * data, read fresh on every run: a boundary proven against a fixture is proven
 * against nothing.
 *
 * The base URL is resolved in the config (`base-url.ts`) so the refusal about a
 * missing app is said once, before a browser is launched.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

export default function globalSetup(): void {
    execFileSync(
        "npx",
        ["tsx", "features/content-ir/sandbox/make-parity-witness.ts"],
        { cwd: ROOT, stdio: "inherit" },
    );
}
