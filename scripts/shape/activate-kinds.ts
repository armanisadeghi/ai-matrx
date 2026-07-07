#!/usr/bin/env tsx
/**
 * activate-kinds — the REAL dual-gate activator for the gold-mine kind families
 * (Shape System, SHAPE_SYSTEM.md R6 + the "verify live, never trust reports"
 * law).
 *
 * These 10 gold-mine root families (mermaid_diagram, task_list,
 * resource_collection, progress_tracker, timeline, structured_info, transcript,
 * troubleshooting_guide, cooking_recipe, research_report) — plus their child
 * kinds — are registered in the compiled floor (system-kinds.ts) and render,
 * but sit at `is_active=false` in content_ir.kind_definition. This script runs
 * BOTH legs of the dual gate (registry/kind-dual-gate.ts) against each kind's
 * live canonical `kind_example.data` and flips `is_active=true` for GENUINE
 * passers ONLY. A kind that fails a leg stays false, with the failure printed.
 *
 * The dual gate legs, both runnable fully in-process (NO browser needed):
 *   1. Structural (ajv over the live `emitted_json_schema`, __kind stripped) —
 *      the same leg Python's Pydantic owns; they validate the same sample
 *      against the same schema.
 *   2. Render (the legacy bridge `toLegacyServerData` must derive real,
 *      non-empty serverData from the sample). This is an IN-PROCESS render-leg
 *      check — the bridge is a pure function; `validateRender` never mounts a
 *      React component. Root gold-mine kinds all carry a `legacyBlockType` +
 *      `toLegacyServerData` bridge, so the render leg is a true gate here, not
 *      a deferred "structural-only + test-attested" fallback.
 *
 * Child kinds (task_item, recipe_ingredient, …) have NO standalone renderer —
 * they render only nested inside their root — so they legitimately FAIL the
 * render leg ("no component") and stay inactive. This matches the existing
 * precedent: flashcard_set / quiz_set are active; their children are not.
 *
 *   tsx scripts/shape/activate-kinds.ts            # dry-run (default): report only
 *   tsx scripts/shape/activate-kinds.ts --apply    # flip is_active=true for passers
 *   tsx scripts/shape/activate-kinds.ts timeline task_list …   # explicit slug subset
 *
 * READ-ONLY against the DB unless --apply. Even under --apply it touches ONLY
 * passers' `is_active` (never a failer, never any other column).
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

import {
  runKindDualGate,
  describeDualGateFailure,
  type DualGateDefinition,
  type DualGateResult,
} from "../../features/content-ir/registry/kind-dual-gate";
import type { KindDefinition } from "../../features/content-ir/registry/kind-registry.types";

// The gold-mine family arrays — the SAME KindDefinition objects that
// SYSTEM_KIND_DEFINITIONS spreads. Imported directly (not via the system-kinds
// barrel) so this harness never pulls the non-gold-mine kind modules'
// React-parser VALUE imports (comparison / decision-tree / diagram import from
// @/components/mardown-display), which are not tsx-safe. Every gold-mine
// module's only @/components imports are `import type` (erased at runtime), so
// this set is clean under tsx.
import { MERMAID_DIAGRAM_KIND_DEFINITION } from "../../features/content-ir/kinds/mermaid-diagram";
import { TASK_LIST_KIND_DEFINITIONS } from "../../features/content-ir/kinds/task-list";
import { RESOURCE_COLLECTION_KIND_DEFINITIONS } from "../../features/content-ir/kinds/resource-collection";
import { PROGRESS_TRACKER_KIND_DEFINITIONS } from "../../features/content-ir/kinds/progress-tracker";
import { TIMELINE_KIND_DEFINITIONS } from "../../features/content-ir/kinds/timeline";
import { STRUCTURED_INFO_KIND_DEFINITIONS } from "../../features/content-ir/kinds/structured-info";
import { TRANSCRIPT_KIND_DEFINITIONS } from "../../features/content-ir/kinds/transcript";
import { TROUBLESHOOTING_KIND_DEFINITIONS } from "../../features/content-ir/kinds/troubleshooting-guide";
import { COOKING_RECIPE_KIND_DEFINITIONS } from "../../features/content-ir/kinds/cooking-recipe";
import { RESEARCH_REPORT_KIND_DEFINITIONS } from "../../features/content-ir/kinds/research-report";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

// ─── The gold-mine kind set (roots + children) ──────────────────────────────

const GOLD_MINE_DEFINITIONS: KindDefinition[] = [
  MERMAID_DIAGRAM_KIND_DEFINITION,
  ...TASK_LIST_KIND_DEFINITIONS,
  ...RESOURCE_COLLECTION_KIND_DEFINITIONS,
  ...PROGRESS_TRACKER_KIND_DEFINITIONS,
  ...TIMELINE_KIND_DEFINITIONS,
  ...STRUCTURED_INFO_KIND_DEFINITIONS,
  ...TRANSCRIPT_KIND_DEFINITIONS,
  ...TROUBLESHOOTING_KIND_DEFINITIONS,
  ...COOKING_RECIPE_KIND_DEFINITIONS,
  ...RESEARCH_REPORT_KIND_DEFINITIONS,
];

const DEF_BY_KIND = new Map<string, KindDefinition>(
  GOLD_MINE_DEFINITIONS.map((def) => [def.kind, def]),
);
const DEFAULT_SLUGS: string[] = GOLD_MINE_DEFINITIONS.map((def) => def.kind);

// ─── DB reads (service key) ─────────────────────────────────────────────────

interface KindDefinitionRow {
  id: string;
  kind: string;
  version: number;
  is_active: boolean;
  emitted_json_schema: unknown;
}
interface KindExampleRow {
  id: string;
  kind_definition_id: string;
  is_canonical: boolean;
  validation_status: string | null;
  data: unknown;
  updated_at: string;
}

function makeClient() {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)",
    );
  }
  return createClient(url, key);
}

type SupabaseClientLike = ReturnType<typeof makeClient>;

async function fetchRows(
  supabase: SupabaseClientLike,
  slugs: string[],
): Promise<{
  kindRows: KindDefinitionRow[];
  exampleByDefId: Map<string, KindExampleRow>;
}> {
  const kindsRes = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,kind,version,is_active,emitted_json_schema")
    .in("kind", slugs)
    .is("deleted_at", null);
  if (kindsRes.error) {
    throw new Error(`read content_ir.kind_definition: ${kindsRes.error.message}`);
  }
  const kindRows = (kindsRes.data ?? []) as KindDefinitionRow[];

  const defIds = kindRows.map((r) => r.id);
  const exampleByDefId = new Map<string, KindExampleRow>();
  if (defIds.length > 0) {
    const examplesRes = await supabase
      .schema("content_ir")
      .from("kind_example")
      .select("id,kind_definition_id,is_canonical,validation_status,data,updated_at")
      .in("kind_definition_id", defIds)
      .eq("is_canonical", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (examplesRes.error) {
      throw new Error(`read content_ir.kind_example: ${examplesRes.error.message}`);
    }
    // ordered newest-first → first row per def wins (there is one canonical each).
    for (const row of (examplesRes.data ?? []) as KindExampleRow[]) {
      if (!exampleByDefId.has(row.kind_definition_id)) {
        exampleByDefId.set(row.kind_definition_id, row);
      }
    }
  }
  return { kindRows, exampleByDefId };
}

// ─── Per-kind verdict ───────────────────────────────────────────────────────

type Verdict =
  | { slug: string; outcome: "pass"; row: KindDefinitionRow; result: DualGateResult }
  | { slug: string; outcome: "fail"; row: KindDefinitionRow; result: DualGateResult }
  | { slug: string; outcome: "no-example"; row: KindDefinitionRow }
  | { slug: string; outcome: "missing-definition" };

function evaluate(
  slug: string,
  kindRows: KindDefinitionRow[],
  exampleByDefId: Map<string, KindExampleRow>,
): Verdict {
  const row = kindRows.find((r) => r.kind === slug);
  if (!row) return { slug, outcome: "missing-definition" };

  const example = exampleByDefId.get(row.id);
  if (!example) return { slug, outcome: "no-example", row };

  const def = (DEF_BY_KIND.get(slug) ?? null) as DualGateDefinition | null;
  const sample =
    example.data && typeof example.data === "object" && !Array.isArray(example.data)
      ? (example.data as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const result = runKindDualGate({
    kind: slug,
    sample,
    emittedJsonSchema: row.emitted_json_schema,
    definition: def,
  });
  return { slug, outcome: result.isActive ? "pass" : "fail", row, result };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function leg(ok: boolean): string {
  return ok ? `${C.green}pass${C.reset}` : `${C.red}FAIL${C.reset}`;
}

function printTable(verdicts: Verdict[]): void {
  const width = Math.max(...verdicts.map((v) => v.slug.length), 4) + 2;
  console.log(
    `\n${C.bold}${"kind".padEnd(width)}structural  render      already  ->  verdict${C.reset}`,
  );
  for (const v of verdicts) {
    const name = v.slug.padEnd(width);
    if (v.outcome === "missing-definition") {
      console.log(
        `${name}${C.dim}—           —           —${C.reset}        ->  ${C.yellow}no live kind_definition row${C.reset}`,
      );
      continue;
    }
    const already = v.row.is_active ? `${C.green}on ${C.reset}` : `${C.dim}off${C.reset}`;
    if (v.outcome === "no-example") {
      console.log(
        `${name}${C.dim}—           —${C.reset}           ${already}      ->  ${C.yellow}no canonical example — skip${C.reset}`,
      );
      continue;
    }
    const s = leg(v.result.structural.ok).padEnd(4 + C.green.length + C.reset.length);
    const r = leg(v.result.render.ok).padEnd(4 + C.green.length + C.reset.length);
    const verdict =
      v.outcome === "pass"
        ? `${C.green}${C.bold}ACTIVATE${C.reset}`
        : `${C.red}${C.bold}stays inactive${C.reset}`;
    console.log(`${name}${s}    ${r}    ${already}      ->  ${verdict}`);
  }
}

function printFailures(verdicts: Verdict[]): void {
  const fails = verdicts.filter(
    (v): v is Extract<Verdict, { outcome: "fail" }> => v.outcome === "fail",
  );
  if (fails.length === 0) return;
  console.log(`\n${C.yellow}${C.bold}── failed legs (recorded, stay is_active=false) ──${C.reset}`);
  for (const v of fails) {
    console.log(`  ${C.yellow}${describeDualGateFailure(v.slug, v.result)}${C.reset}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const slugArgs = argv.filter((a) => !a.startsWith("--"));
  const slugs = slugArgs.length > 0 ? slugArgs : DEFAULT_SLUGS;

  const supabase = makeClient();
  const { kindRows, exampleByDefId } = await fetchRows(supabase, slugs);

  const verdicts = slugs.map((slug) => evaluate(slug, kindRows, exampleByDefId));
  printTable(verdicts);
  printFailures(verdicts);

  const passers = verdicts.filter(
    (v): v is Extract<Verdict, { outcome: "pass" }> => v.outcome === "pass",
  );
  const toActivate = passers.filter((v) => !v.row.is_active);
  const alreadyActive = passers.filter((v) => v.row.is_active);

  console.log(
    `\n${C.bold}Summary:${C.reset} ${verdicts.length} kind(s) evaluated · ` +
      `${C.green}${passers.length} pass both legs${C.reset} ` +
      `(${toActivate.length} to flip on, ${alreadyActive.length} already on) · ` +
      `${C.red}${verdicts.filter((v) => v.outcome === "fail").length} failed${C.reset} · ` +
      `${C.yellow}${verdicts.filter((v) => v.outcome === "no-example").length} no-example / ` +
      `${verdicts.filter((v) => v.outcome === "missing-definition").length} missing${C.reset}`,
  );

  if (!apply) {
    console.log(
      `\n${C.dim}dry-run (default). Passers to activate: ${
        toActivate.map((v) => v.slug).join(", ") || "(none)"
      }.\nRe-run with --apply to flip is_active=true for passers only.${C.reset}`,
    );
    return 0;
  }

  if (toActivate.length === 0) {
    console.log(`\n${C.green}--apply: nothing to flip (all passers already active).${C.reset}`);
    return 0;
  }

  console.log(`\n${C.cyan}${C.bold}--apply: flipping is_active=true for ${toActivate.length} passer(s)…${C.reset}`);
  let failures = 0;
  for (const v of toActivate) {
    const { error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .update({ is_active: true })
      .eq("id", v.row.id);
    if (error) {
      failures += 1;
      console.error(`  ${C.red}✗ ${v.slug}: ${error.message}${C.reset}`);
    } else {
      console.log(`  ${C.green}✓ ${v.slug} (id ${v.row.id}) → is_active=true${C.reset}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${C.red}${C.bold}${failures} update(s) failed.${C.reset}`);
    return 1;
  }
  console.log(`\n${C.green}${C.bold}✓ activated ${toActivate.length} kind(s).${C.reset}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `${C.red}${C.bold}activate-kinds FAILED:${C.reset}`,
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  });
