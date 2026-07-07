#!/usr/bin/env tsx
/**
 * shape:sample — author a `content_ir.kind_example` sample for a Shape
 * (SHAPE_SYSTEM.md Stage 1 adoption kit).
 *
 * Usage:
 *   pnpm shape:sample <kind> --file sample.json [--label "..."] [--apply]
 *   cat sample.json | pnpm shape:sample <kind> --stdin [--label "..."] [--apply]
 *
 * Behavior:
 *   1. Loads the kind's live `content_ir.kind_definition` row (exit 1 if the
 *      kind doesn't exist).
 *   2. Runs the STRUCTURAL leg of the dual gate (`validateStructuralLeg` —
 *      the exact ajv config + `__kind`-stripping used at activation, never a
 *      parallel validator) against `emitted_json_schema`. Any failure →
 *      per-error print, NOTHING written, exit 1.
 *   3. Dry-run (default) prints the validated value + the row that would be
 *      written. `--apply` inserts ONE `kind_example` row (source 'authored',
 *      `validation_status: 'passed'` — earned by the real ajv run in step 2,
 *      `is_canonical` only when the kind@version has no live canonical
 *      example), then reads the row back and prints it. That insert is the
 *      ONLY DB write this script ever performs.
 *   4. Attempts the RENDER leg via the kind's compiled bridge
 *      (`runKindDualGate`). The registry import graph is NOT CLI-safe (the
 *      system-kinds ↔ kind-registry cycle TDZ-crashes when entered from a
 *      CLI entry — see scripts/shape/check-shapes.ts), so the import is
 *      dynamic and guarded; when it can't run, the script says so honestly.
 *      `is_active` is NEVER written here — activation stays with the Gate on
 *      /administration/kind-registry.
 *
 * Exit codes: 0 ok · 1 kind missing / validation failed / bad sample ·
 * 2 usage / env / infrastructure error.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  runKindDualGate,
  validateStructuralLeg,
  type DualGateDefinition,
} from "../../features/content-ir/registry/kind-dual-gate";
import type { Database } from "../../types/database.types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

type KindExampleInsert = Database["content_ir"]["Tables"]["kind_example"]["Insert"];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function box(lines: string[], color: string): void {
  const width = Math.max(...lines.map((l) => l.length));
  const bar = "═".repeat(width + 2);
  console.error(`${color}${C.bold}╔${bar}╗${C.reset}`);
  for (const l of lines) console.error(`${color}${C.bold}║ ${l.padEnd(width)} ║${C.reset}`);
  console.error(`${color}${C.bold}╚${bar}╝${C.reset}`);
}

function fail(lines: string[], code: 1 | 2): never {
  box(lines, C.red);
  process.exit(code);
}

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  kind: string;
  file: string | null;
  stdin: boolean;
  label: string | null;
  apply: boolean;
}

const USAGE =
  'Usage: pnpm shape:sample <kind> (--file sample.json | --stdin) [--label "..."] [--apply]';

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { kind: "", file: null, stdin: false, label: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") {
      const v = argv[++i];
      if (!v) fail(["--file requires a path", USAGE], 2);
      args.file = v;
    } else if (a === "--stdin") {
      args.stdin = true;
    } else if (a === "--label") {
      const v = argv[++i];
      if (!v) fail(["--label requires a value", USAGE], 2);
      args.label = v;
    } else if (a === "--apply") {
      args.apply = true;
    } else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (a.startsWith("--")) {
      fail([`Unknown flag: ${a}`, USAGE], 2);
    } else if (!args.kind) {
      args.kind = a;
    } else {
      fail([`Unexpected argument: ${a}`, USAGE], 2);
    }
  }
  if (!args.kind) fail(["Missing <kind> argument", USAGE], 2);
  if (args.file && args.stdin) fail(["--file and --stdin are mutually exclusive", USAGE], 2);
  if (!args.file && !args.stdin) fail(["Provide the sample via --file <path> or --stdin", USAGE], 2);
  return args;
}

// ─── Sample loading ──────────────────────────────────────────────────────────

function readSampleText(args: Args): string {
  if (args.file) {
    const path = resolve(process.cwd(), args.file);
    if (!existsSync(path)) fail([`Sample file not found: ${path}`], 2);
    return readFileSync(path, "utf8");
  }
  if (process.stdin.isTTY) {
    fail(["--stdin given but nothing is piped in — pipe the sample JSON", USAGE], 2);
  }
  return readFileSync(0, "utf8");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describeValue(v: unknown): string {
  if (Array.isArray(v)) return `array with ${v.length} item(s)`;
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    const shown = keys.slice(0, 8).join(", ");
    return `object with ${keys.length} top-level key(s): ${shown}${keys.length > 8 ? ", …" : ""}`;
  }
  return `${typeof v} ${JSON.stringify(v)?.slice(0, 60) ?? String(v)}`;
}

// ─── Render leg (informational — never gates the write, never sets is_active) ─

async function attemptRenderLeg(
  kind: string,
  sample: unknown,
  emittedJsonSchema: unknown,
): Promise<void> {
  const honest = `structural leg passed; render leg unavailable in CLI — run the Gate on /administration/kind-registry/${kind}. is_active NOT changed.`;

  if (!isPlainObject(sample)) {
    console.log(`\n${C.yellow}${honest}${C.reset}`);
    console.log(`${C.dim}  (non-object sample — the render-leg bridge only accepts object samples)${C.reset}`);
    return;
  }

  let definition: DualGateDefinition | null = null;
  try {
    // kind-registry transitively imports system-kinds, whose bridge imports
    // cycle back into kind-registry — a require cycle that TDZ-crashes when
    // entered from a CLI entry (see check-shapes.ts). Guarded dynamic import:
    // if it crashes, we say so honestly instead of faking a render verdict.
    const mod = await import("../../features/content-ir/registry/kind-registry");
    definition = mod.kindRegistry.getDefinition(kind) ?? null;
  } catch (err) {
    console.log(`\n${C.yellow}${honest}${C.reset}`);
    console.log(
      `${C.dim}  (registry import failed in CLI: ${err instanceof Error ? err.message : String(err)})${C.reset}`,
    );
    return;
  }

  if (!definition || (!definition.legacyBlockType && !definition.component)) {
    console.log(`\n${C.yellow}${honest}${C.reset}`);
    console.log(`${C.dim}  (no compiled bridge/component facet registered for "${kind}")${C.reset}`);
    return;
  }

  const result = runKindDualGate({ kind, sample, emittedJsonSchema, definition });
  if (result.isActive) {
    console.log(
      `\n${C.green}${C.bold}✓ dual gate passed in-process${C.reset} — structural + render legs both genuinely passed.`,
    );
    if (result.render.detail) console.log(`${C.dim}  render note: ${result.render.detail}${C.reset}`);
    console.log(
      `${C.dim}  is_active NOT changed by this CLI — activation stays with the Gate on /administration/kind-registry/${kind}.${C.reset}`,
    );
  } else {
    box(
      [
        `RENDER LEG FAILED for "${kind}"`,
        result.render.detail ?? "no detail",
        "is_active NOT changed. Fix the bridge/sample, then run the Gate on",
        `/administration/kind-registry/${kind}.`,
      ],
      C.red,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = parseArgs();

  const raw = readSampleText(args);
  let sample: unknown;
  try {
    sample = JSON.parse(raw) as unknown;
  } catch (err) {
    fail(
      [
        "Sample is not valid JSON:",
        err instanceof Error ? err.message : String(err),
      ],
      1,
    );
  }

  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    fail(["Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)"], 2);
  }
  const supabase = createClient<Database>(url, key);
  const contentIr = supabase.schema("content_ir");

  // 1. The kind's live row.
  const { data: kindRows, error: kindErr } = await contentIr
    .from("kind_definition")
    .select("id,kind,label,version,organization_id,is_active,emitted_json_schema")
    .eq("kind", args.kind)
    .is("deleted_at", null);
  if (kindErr) fail([`read content_ir.kind_definition: ${kindErr.message}`], 2);
  if (!kindRows || kindRows.length === 0) {
    fail(
      [
        `Kind "${args.kind}" has no live content_ir.kind_definition row.`,
        "Samples attach to an existing kind — create the kind first.",
        "See the shape-system skill (.claude/skills/shape-system) for the paved road.",
      ],
      1,
    );
  }
  if (kindRows.length > 1) {
    fail(
      [
        `Kind "${args.kind}" resolves to ${kindRows.length} live rows (multiple orgs):`,
        ...kindRows.map((r) => `  ${r.id} (org ${r.organization_id})`),
        "Ambiguous target — resolve the duplicate kind rows before sampling.",
      ],
      1,
    );
  }
  const kindRow = kindRows[0];
  console.log(
    `${C.bold}${kindRow.kind}${C.reset} v${kindRow.version} ${C.dim}(${kindRow.label}, id ${kindRow.id}, is_active ${kindRow.is_active})${C.reset}`,
  );

  if (kindRow.emitted_json_schema === null) {
    fail(
      [
        `Kind "${args.kind}" has no emitted_json_schema — nothing to validate against.`,
        "Materialize the schema first (shape-system skill, step 1).",
      ],
      1,
    );
  }

  // 2. STRUCTURAL leg — the same ajv leg activation uses. Fail → write nothing.
  const structural = validateStructuralLeg(sample, kindRow.emitted_json_schema);
  if (!structural.ok) {
    box([`STRUCTURAL LEG FAILED for "${args.kind}" — nothing written`], C.red);
    const detail = structural.detail ?? "validation failed (no detail)";
    const prefix = "sample failed schema: ";
    if (detail.startsWith(prefix)) {
      for (const e of detail.slice(prefix.length).split("; ")) {
        console.error(`  ${C.red}✗${C.reset} ${e}`);
      }
    } else {
      console.error(`  ${C.red}✗${C.reset} ${detail}`);
    }
    return 1;
  }
  console.log(`${C.green}✓ structural leg passed${C.reset} — ${describeValue(sample)}`);

  // 3. Canonical probe — is_canonical only when kind@version has no live
  //    canonical example (kind_example_canonical_unique partial-unique index).
  const { data: canonicalRows, error: canonErr } = await contentIr
    .from("kind_example")
    .select("id,label")
    .eq("kind_definition_id", kindRow.id)
    .eq("kind_version", kindRow.version)
    .eq("is_canonical", true)
    .is("deleted_at", null);
  if (canonErr) fail([`read content_ir.kind_example: ${canonErr.message}`], 2);
  const willBeCanonical = (canonicalRows ?? []).length === 0;

  const insertRow: KindExampleInsert = {
    kind_definition_id: kindRow.id,
    kind_version: kindRow.version,
    organization_id: kindRow.organization_id,
    data: sample,
    source: "authored",
    label: args.label,
    is_canonical: willBeCanonical,
    validation_status: "passed",
    validated_at: new Date().toISOString(),
  };

  console.log(`\n${C.bold}kind_example row${args.apply ? "" : " (would be written)"}:${C.reset}`);
  console.log(`  kind_definition_id  ${insertRow.kind_definition_id}`);
  console.log(`  kind_version        ${insertRow.kind_version}`);
  console.log(`  organization_id     ${insertRow.organization_id}`);
  console.log(`  source              ${insertRow.source}`);
  console.log(`  label               ${insertRow.label ?? "(none)"}`);
  console.log(
    `  is_canonical        ${insertRow.is_canonical}${
      willBeCanonical
        ? ` ${C.dim}(no live canonical example for ${kindRow.kind}@v${kindRow.version})${C.reset}`
        : ` ${C.dim}(live canonical already exists: ${(canonicalRows ?? [])
            .map((r) => r.id)
            .join(", ")})${C.reset}`
    }`,
  );
  console.log(`  validation_status   ${insertRow.validation_status}`);
  console.log(`  validated_at        ${insertRow.validated_at}`);
  console.log(`  data                ${describeValue(sample)}`);

  if (!args.apply) {
    console.log(`\n${C.cyan}DRY RUN — no writes. Re-run with --apply to insert.${C.reset}`);
    await attemptRenderLeg(kindRow.kind, sample, kindRow.emitted_json_schema);
    return 0;
  }

  // 4. Apply — the ONLY DB write this script performs.
  const { data: inserted, error: insErr } = await contentIr
    .from("kind_example")
    .insert(insertRow)
    .select("id")
    .single();
  if (insErr) fail([`insert content_ir.kind_example: ${insErr.message}`], 2);

  // 5. Read-back verification — never report a write we didn't re-read.
  const { data: readBack, error: rbErr } = await contentIr
    .from("kind_example")
    .select(
      "id,kind_definition_id,kind_version,source,label,is_canonical,validation_status,validated_at,organization_id,created_at",
    )
    .eq("id", inserted.id)
    .single();
  if (rbErr || !readBack) {
    fail(
      [
        `INSERT reported id ${inserted.id} but READ-BACK FAILED: ${rbErr?.message ?? "row not found"}`,
        "Treat the write as UNVERIFIED — check content_ir.kind_example manually.",
      ],
      2,
    );
  }
  console.log(`\n${C.green}${C.bold}✓ inserted + read back${C.reset}`);
  console.log(`  id                  ${readBack.id}`);
  console.log(`  kind_definition_id  ${readBack.kind_definition_id}`);
  console.log(`  kind_version        ${readBack.kind_version}`);
  console.log(`  source              ${readBack.source}`);
  console.log(`  label               ${readBack.label ?? "(none)"}`);
  console.log(`  is_canonical        ${readBack.is_canonical}`);
  console.log(`  validation_status   ${readBack.validation_status}`);
  console.log(`  validated_at        ${readBack.validated_at}`);
  console.log(`  organization_id     ${readBack.organization_id}`);
  console.log(`  created_at          ${readBack.created_at}`);

  await attemptRenderLeg(kindRow.kind, sample, kindRow.emitted_json_schema);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `${C.red}${C.bold}shape:sample FAILED:${C.reset}`,
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  });
