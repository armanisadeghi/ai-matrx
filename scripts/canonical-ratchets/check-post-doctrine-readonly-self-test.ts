import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";

const ROOT = process.env.RATCHET_REPO_ROOT ?? resolve(import.meta.dirname, "..", "..");
const SANDBOX = mkdtempSync(join(tmpdir(), "canonical-ratchet-readonly-"));
for (const file of ["snapshot.ts", "check-post-doctrine-conformance.ts", "post-doctrine-baseline.json"]) {
  copyFileSync(resolve(import.meta.dirname, file), resolve(SANDBOX, file));
}
writeFileSync(resolve(SANDBOX, "runner.ts"), `
const fixture = JSON.parse(process.env.RATCHET_FIXTURE_JSON ?? "{}");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ratchet.test";
process.env.SUPABASE_SECRET_KEY = "scratch-key";
globalThis.fetch = async () => fixture.unavailable
  ? new Response("unavailable", { status: 503 })
  : new Response(JSON.stringify(fixture.snapshot), { status: 200, headers: { "Content-Type": "application/json" } });
void import("./check-post-doctrine-conformance.ts");
`);
const BASELINE = resolve(SANDBOX, "post-doctrine-baseline.json");
const ORIGINAL_BASELINE = readFileSync(BASELINE, "utf8");
const RUNNER = resolve(SANDBOX, "runner.ts");
const REQUIRED = ["client_read_only_grants", "client_read_only_policies", "client_read_only_registry_guard"];

function snapshot(marked = 1) {
  return {
    generated_at: "2026-09-19T00:00:00Z", audit_refreshed_at: "2026-09-19T00:00:00Z",
    post_doctrine_cutoff: "2026-08-12T00:00:00Z", min_base_col_score: 4,
    ddl_guard_attached: true, ddl_guard_log_earliest: "2026-08-13T00:00:00Z",
    births_after_cutoff: 0, unregistered: [], post_doctrine_fails: [],
    client_read_only_marked_count: marked, client_read_only_checked_count: marked,
    client_read_only_measurement_complete: true, client_read_only_all_pass: true,
    client_read_only_unmeasured_count: 0,
    client_read_only_checks: marked === 0 ? [] : REQUIRED.map((check_name) => ({
      schema: "browser", table: "run", token: "browser_run", check_name, status: "PASS",
    })),
  };
}

function run(fixture: object, args: string[]) {
  writeFileSync(BASELINE, ORIGINAL_BASELINE);
  const result = spawnSync("pnpm", ["exec", "tsx", RUNNER, ...args], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, RATCHET_FIXTURE_JSON: JSON.stringify(fixture) },
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, baseline: readFileSync(BASELINE, "utf8") };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertValid(label: string, value: object) {
  let result = run({ snapshot: value }, ["--strict"]);
  assert(result.code === 0, `${label} strict normal failed: ${result.stderr}`);
  result = run({ snapshot: value }, ["--strict", "--json"]);
  assert(result.code === 0, `${label} strict JSON failed: ${result.stderr}`);
  assert(JSON.parse(result.stdout).readonly_measurement_failures.length === 0, `${label} JSON was not clean`);
  result = run({ snapshot: value }, ["--update-baseline"]);
  assert(result.code === 0, `${label} baseline update failed: ${result.stderr}`);
}

function assertInvalid(label: string, value: object, expected: string) {
  let result = run({ snapshot: value }, ["--strict"]);
  assert(result.code === 1 && `${result.stdout}${result.stderr}`.includes(expected), `${label} strict normal did not fail for ${expected}`);
  result = run({ snapshot: value }, ["--strict", "--json"]);
  assert(result.code === 1, `${label} strict JSON passed`);
  assert(JSON.parse(result.stdout).readonly_measurement_failures.some((failure: string) => failure.includes(expected)), `${label} JSON omitted ${expected}`);
  result = run({ snapshot: value }, ["--update-baseline"]);
  assert(result.code === 1, `${label} baseline update passed`);
  assert(result.baseline === ORIGINAL_BASELINE, `${label} baseline update wrote despite invalid measurement`);
}

assertValid("complete marked measurement", snapshot());
assertValid("complete zero-mark measurement", snapshot(0));

const failed = snapshot(); failed.client_read_only_checks[0]!.status = "FAIL";
assertInvalid("present FAIL", failed, "is FAIL");
const missing = snapshot(); missing.client_read_only_checks.pop();
assertInvalid("missing check", missing, "appears 0 times");
const duplicate = snapshot(); duplicate.client_read_only_checks.push({ ...duplicate.client_read_only_checks[0]! });
assertInvalid("duplicate check", duplicate, "appears 2 times");
const unmeasured = snapshot(); unmeasured.client_read_only_measurement_complete = false; unmeasured.client_read_only_all_pass = false; unmeasured.client_read_only_unmeasured_count = 1;
assertInvalid("unmeasured result", unmeasured, "measurement_complete is false");
const mismatch = snapshot(); mismatch.client_read_only_checked_count = 0;
assertInvalid("count mismatch", mismatch, "marked 1 != checked 0");
const inconsistentToken = snapshot(); inconsistentToken.client_read_only_checks[1]!.token = "other";
assertInvalid("inconsistent token", inconsistentToken, "inconsistent tokens");
for (const field of ["schema", "table", "token"] as const) {
  const emptyIdentity = snapshot(); emptyIdentity.client_read_only_checks[0]![field] = "";
  assertInvalid(`empty ${field}`, emptyIdentity, "no complete relation identity");
}
const legacyZero: Record<string, unknown> = snapshot(0); delete legacyZero.client_read_only_marked_count;
assertInvalid("missing fields at zero marks", legacyZero, "client_read_only_marked_count is missing or invalid");

for (const args of [["--strict"], ["--strict", "--json"], ["--update-baseline"]]) {
  const result = run({ unavailable: true }, args);
  assert(result.code === 1 && `${result.stdout}${result.stderr}`.includes("was not measured"), `unavailable RPC passed ${args.join(" ")}`);
  if (args.includes("--update-baseline")) assert(result.baseline === ORIGINAL_BASELINE, "unavailable RPC updated baseline");
}

console.log("readonly CLI self-test passed: valid marked/zero fixtures and all malformed/unavailable cases fail closed.");
