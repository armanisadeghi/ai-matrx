/**
 * check-org-header-lanes — static sweep for the X-Organization-Id admission
 * contract (matrx-connect AuthMiddleware, 2026-08-30).
 *
 * THE CLASS this guards: a hand-rolled transport that sends a Bearer JWT to a
 * python-backend base URL without organization admission. The server refuses
 * such requests with 400 organization_required, so every one of these lanes is
 * a production outage waiting for its first authenticated caller — the agent
 * cache-bust lane and the lulu-pricing guest lane both shipped broken because
 * per-file censuses kept missing lanes. This sweep is mechanical: it flags any
 * file that BOTH
 *
 *   1. builds an `Authorization: Bearer ${…}` header by hand, AND
 *   2. names a python-backend base URL
 *      (AIDREAM_PRODUCTION_URL / NEXT_PUBLIC_BACKEND_URL* / BACKEND_URLS /
 *      selectResolvedBaseUrl / resolveServiceBaseUrl / resolveBaseUrl /
 *      *.matrxserver.com / NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL),
 *
 * while carrying NONE of the compliance signals:
 *
 *   - an `X-Organization-Id` header (hand-stamped),
 *   - the shared kernel (`applyOrganizationContextHeader` /
 *     `requireOrganizationContext` / `organizationContextHeaders`),
 *   - the admission primitive (`waitForOrganizationAdmission` /
 *     `peekSelectedOrganizationId`),
 *   - a compliant choke point's ready-made header object (`authHeaders` from
 *     `useApiTestConfig` / `useServerConfig`, `buildApiAuthHeaders`,
 *     `getBackendProxyAuthHeaders`),
 *   - an import of an allowlisted transport module (the request then rides a
 *     compliant choke point).
 *
 * A lane that is legitimately org-less goes in
 * scripts/org-header-lanes.allowlist.json WITH A REASON — never silently.
 *
 * Run: pnpm check:org-header-lanes   (also runs inside
 * pnpm check:organization-context, which CI runs on every PR).
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "utils",
  "scripts",
];

/** Hand-built Bearer template: `Authorization` near a `Bearer ${...}` interpolation. */
const BEARER_TEMPLATE = /Authorization[^\n]{0,60}Bearer \$\{/;

const BACKEND_URL_SIGNALS = [
  "AIDREAM_PRODUCTION_URL",
  "NEXT_PUBLIC_BACKEND_URL",
  "NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL",
  "BACKEND_URLS",
  "selectResolvedBaseUrl",
  "resolveServiceBaseUrl",
  "resolveBaseUrl(",
  ".matrxserver.com",
];

const COMPLIANCE_SIGNALS = [
  "X-Organization-Id",
  "applyOrganizationContextHeader",
  "requireOrganizationContext",
  "organizationContextHeaders",
  "waitForOrganizationAdmission",
  "peekSelectedOrganizationId",
  "stampRunStreamOrganizationContext",
  "buildApiAuthHeaders",
  "getBackendProxyAuthHeaders",
  ".authHeaders",
  "authHeaders,",
  "authHeaders:",
];

/**
 * Importing one of these means the request rides a compliant choke point that
 * stamps (or deliberately, contract-correctly omits) the organization header.
 */
const ALLOWLISTED_TRANSPORT_IMPORTS = [
  "@/lib/api/call-api",
  "@/lib/api/backend-client",
  "@/lib/api/matrx-transport",
  "@/lib/api/context-api",
  "@/lib/api/typed-client",
  "@/lib/api/hr-contract-client",
  "@/lib/api/proxy-backend-auth-headers",
  "@/lib/python-client",
  "@/hooks/useApiAuth",
  "@/features/files/media-client/client",
  "@/components/api-test-config/useApiTestConfig",
  "@ai-matrx/agents/matrx",
];

interface AllowlistEntry {
  file: string;
  reason: string;
}

function loadAllowlist(): Map<string, string> {
  const path = join(ROOT, "scripts", "org-header-lanes.allowlist.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    entries: AllowlistEntry[];
  };
  const map = new Map<string, string>();
  for (const entry of parsed.entries ?? []) {
    if (!entry.file || !entry.reason || entry.reason.trim().length < 10) {
      console.error(
        `[check-org-header-lanes] allowlist entry for ${entry.file ?? "(missing file)"} needs a real reason (>= 10 chars).`,
      );
      process.exit(2);
    }
    map.set(entry.file, entry.reason);
  }
  return map;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "__mocks__") continue;
      yield* walk(full);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories)\.tsx?$/.test(name) &&
      // This guard and its allowlist describe the pattern they hunt.
      name !== "check-org-header-lanes.ts"
    ) {
      yield full;
    }
  }
}

function main(): number {
  const allowlist = loadAllowlist();
  const violations: string[] = [];
  const allowlisted: string[] = [];
  let scanned = 0;

  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    let files: Generator<string>;
    try {
      statSync(abs);
      files = walk(abs);
    } catch {
      continue;
    }
    for (const file of files) {
      scanned += 1;
      const source = readFileSync(file, "utf8");
      if (!BEARER_TEMPLATE.test(source)) continue;
      if (!BACKEND_URL_SIGNALS.some((s) => source.includes(s))) continue;
      if (COMPLIANCE_SIGNALS.some((s) => source.includes(s))) continue;
      if (
        ALLOWLISTED_TRANSPORT_IMPORTS.some((s) => source.includes(`"${s}"`))
      ) {
        continue;
      }
      const rel = relative(ROOT, file);
      const reason = allowlist.get(rel);
      if (reason) {
        allowlisted.push(`${rel} — allowlisted: ${reason}`);
      } else {
        violations.push(rel);
      }
    }
  }

  for (const line of allowlisted) {
    console.log(`[check-org-header-lanes] ${line}`);
  }

  if (violations.length > 0) {
    console.error(
      `\n[check-org-header-lanes] ${violations.length} lane(s) hand-build a Bearer header toward a python-backend base URL with NO organization admission — the server refuses these with 400 organization_required:\n`,
    );
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error(
      `\nFix: stamp X-Organization-Id via the shared kernel (lib/api/organization-context.ts — see features/marketing/seo/dataforseo/client.ts for the pattern), ride a compliant transport (callApi / python-client / backend-client / matrx-transport / typed-client), or — ONLY for a lane that is legitimately org-less — add an entry with a reason to scripts/org-header-lanes.allowlist.json.\n`,
    );
    return 1;
  }

  console.log(
    `[check-org-header-lanes] OK — ${scanned} files scanned, 0 org-less hand-built Bearer lanes toward the backend.`,
  );
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error("[check-org-header-lanes] unexpected error:", err);
  process.exit(2);
}
