/**
 * Archetype-expansion drift guard — proves matrx-frontend's archetype twin
 * still matches aidream's canonical expander.
 *
 *   pnpm check:archetype-expansion
 *
 * TWO implementations of these rules exist: aidream's
 * `aidream/services/content_plan/archetypes.py` (CANONICAL, Python — what the
 * chat tool runs) and this repo's
 * `features/marketing/content-plan/setup/archetypes.ts` (what the Site Setup
 * view previews and writes with). They are pinned to each other ONLY by the
 * shared fixture `archetype-expansion-cases.json`. If this check fails, fix the
 * TS twin — NEVER the fixture, and never by "adjusting" an expectation.
 *
 * A missing or unreadable fixture is a FAILURE, not a skip: an unpinned twin is
 * the dangerous state, and a silent skip is how it would stay unpinned.
 *
 * The fixture must also stay byte-identical to aidream's copy. When a
 * co-located aidream checkout is present (or AIDREAM_DIR is set) this script
 * compares checksums and screams on drift; without one it says so out loud
 * rather than quietly claiming the copy is current.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  expandArchetype,
  parseArchetypeMap,
  walkSpec,
  type Archetype,
  type PlanSpecNode,
} from "../features/marketing/content-plan/setup/archetypes";
import {
  parseConceptCatalog,
  type Concept,
} from "../features/marketing/content-plan/setup/concepts";

interface ExpectNode {
  depth: number;
  slug: string | null;
  label: string;
  node_type: string;
  page_type: string | null;
  brief: string[];
  attributes: unknown;
}

interface ExpectConcept {
  concept: string;
  label: string;
  variant: string;
  variant_label: string;
  order: number;
  family_key: string | null;
  page_routes: string[];
}

interface ExpandCase {
  name: string;
  archetype_key: string;
  archetype?: unknown;
  archetype_map_raw?: unknown;
  /** The concept MENU a selection-form case resolves against (raw blob). */
  catalog?: unknown;
  counts: Record<string, number> | null;
  names: Record<string, string[]> | null;
  expect: {
    counts: Record<string, number>;
    routes: string[];
    page_count: number;
    families: {
      key: string;
      label: string;
      route: string;
      count: number;
      materialize: string;
      child_page_type: string | null;
      child_labels: string[];
    }[];
    foundation: {
      key: string;
      kind: string;
      label: string;
      required: number;
      declared_as: string;
    }[];
    nodes: ExpectNode[];
    concepts?: ExpectConcept[];
    omits?: string[];
  };
}

interface ErrorCase {
  name: string;
  archetype_key: string;
  archetype?: unknown;
  catalog?: unknown;
  archetype_map_raw?: unknown;
  counts: Record<string, number> | null;
  names: Record<string, string[]> | null;
  expect_error_mentions: string[];
}

interface Fixture {
  expand_cases?: ExpandCase[];
  error_cases?: ErrorCase[];
}

const strict = process.argv.includes("--strict");
const repoRoot = join(__dirname, "..");
const fixturePath = join(
  repoRoot,
  "features/marketing/content-plan/setup/archetype-expansion-cases.json",
);

let fixture: Fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
} catch {
  console.error(`FAIL: fixture not readable at ${fixturePath}`);
  console.error(
    "The archetype twin is UNPINNED without it. Copy it verbatim from " +
      "aidream/aidream/services/content_plan/archetype-expansion-cases.json.",
  );
  process.exit(1);
}

let total = 0;
let failures = 0;

function check(group: string, name: string, problems: string[]): void {
  total++;
  if (problems.length > 0) {
    failures++;
    console.error(`  ✗ [${group}] ${name}`);
    for (const p of problems) console.error(`      ${p}`);
  }
}

/** Parse ONE archetype out of a case, exactly as the runtime library load does. */
function parseCase(
  entry: { archetype_key: string; archetype?: unknown; archetype_map_raw?: unknown },
): Archetype {
  const raw =
    entry.archetype_map_raw !== undefined
      ? entry.archetype_map_raw
      : { [entry.archetype_key]: entry.archetype };
  const parsed = parseArchetypeMap(raw, "fixture", "builtin");
  const found = parsed.find((item) => item.key === entry.archetype_key);
  if (!found) {
    throw new Error(`fixture case did not yield archetype "${entry.archetype_key}"`);
  }
  return found;
}

/**
 * The concept menu a SELECTION-form case resolves against. Parsed from the
 * fixture's raw blob, never handed over pre-built: the catalog parser is half
 * of what the twin has to agree on.
 */
function parseCatalog(entry: { catalog?: unknown }): Record<string, Concept> | undefined {
  if (entry.catalog === undefined || entry.catalog === null) return undefined;
  return parseConceptCatalog(entry.catalog, "fixture catalog");
}

function flatten(roots: PlanSpecNode[]): { node: PlanSpecNode; depth: number }[] {
  const out: { node: PlanSpecNode; depth: number }[] = [];
  const visit = (node: PlanSpecNode, depth: number) => {
    out.push({ node, depth });
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}

function same(label: string, got: unknown, want: unknown, problems: string[]): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) problems.push(`${label}: expected ${b}, got ${a}`);
}

// ── 1. expand_cases ──────────────────────────────────────────────────────────
for (const c of fixture.expand_cases ?? []) {
  const problems: string[] = [];
  try {
    const archetype = parseCase(c);
    const expanded = expandArchetype(archetype, {
      counts: c.counts ?? undefined,
      names: c.names ?? undefined,
      catalog: parseCatalog(c),
    });

    same("counts", expanded.counts, c.expect.counts, problems);
    same("routes", expanded.routes, c.expect.routes, problems);
    same("page_count", expanded.pageCount, c.expect.page_count, problems);
    same(
      "families",
      expanded.families.map((family) => ({
        key: family.key,
        label: family.label,
        route: family.route,
        count: family.count,
        materialize: family.materialize,
        child_page_type: family.childPageType,
        child_labels: family.childLabels,
      })),
      c.expect.families,
      problems,
    );
    same(
      "foundation",
      expanded.foundation.map((item) => ({
        key: item.key,
        kind: item.kind,
        label: item.label,
        required: item.required,
        declared_as: item.declaredAs,
      })),
      c.expect.foundation,
      problems,
    );
    same(
      "nodes",
      flatten(expanded.roots).map(({ node, depth }) => ({
        depth,
        slug: node.slug,
        label: node.label,
        node_type: node.nodeType,
        page_type: node.pageType,
        brief: node.brief,
        attributes: node.attributes,
      })),
      c.expect.nodes,
      problems,
    );
    // Selection-form reporting: which menu items produced this, and what the
    // shape deliberately left off. Absent on the pre-concept cases.
    same(
      "concepts",
      expanded.concepts.map((item) => ({
        concept: item.concept,
        label: item.label,
        variant: item.variant,
        variant_label: item.variantLabel,
        order: item.order,
        family_key: item.familyKey,
        page_routes: item.pageRoutes,
      })),
      c.expect.concepts ?? [],
      problems,
    );
    same("omits", expanded.omits, c.expect.omits ?? [], problems);

    // walkSpec is what the commit writer walks — it must agree with the
    // preview's own flatten, or the two disagree about write order.
    same(
      "walkSpec order",
      walkSpec(expanded.roots).map((node) => node.route),
      flatten(expanded.roots).map(({ node }) => node.route),
      problems,
    );
  } catch (error) {
    problems.push(
      `threw where the canonical expander succeeds: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  check("expand", c.name, problems);
}

// ── 2. error_cases (malformed config must be LOUD in both languages) ─────────
for (const c of fixture.error_cases ?? []) {
  const problems: string[] = [];
  let message: string | null = null;
  try {
    const archetype = parseCase(c);
    expandArchetype(archetype, {
      counts: c.counts ?? undefined,
      names: c.names ?? undefined,
      catalog: parseCatalog(c),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (message === null) {
    problems.push("expected an error, but the expansion succeeded");
  } else {
    for (const needle of c.expect_error_mentions) {
      if (!message.includes(needle)) {
        problems.push(`error message does not mention "${needle}" — got: ${message}`);
      }
    }
  }
  check("error", c.name, problems);
}

// ── 3. fixture freshness vs aidream (loud when it cannot be checked) ─────────
const aidreamDir = process.env.AIDREAM_DIR ?? join(repoRoot, "..", "aidream");
const canonicalFixture = join(
  aidreamDir,
  "aidream/services/content_plan/archetype-expansion-cases.json",
);
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
if (existsSync(canonicalFixture)) {
  if (sha256(canonicalFixture) !== sha256(fixturePath)) {
    failures++;
    total++;
    console.error("  ✗ [fixture] local copy has DRIFTED from aidream's canonical fixture");
    console.error(`      cp ${canonicalFixture} ${fixturePath}`);
    console.error("      then re-run this check — the twin may need updating too.");
  }
} else {
  console.warn(
    `NOTE: no aidream checkout at ${aidreamDir} — fixture freshness NOT verified ` +
      "(set AIDREAM_DIR to check it).",
  );
}

if (total === 0) {
  console.error("FAIL: fixture parsed but contained zero cases — inspect its shape.");
  process.exit(1);
}

console.log(`archetype-expansion twin: ${total - failures}/${total} fixture cases passed`);
if (failures > 0) {
  console.error(
    `FAIL: ${failures} case(s) diverge from the canonical expander — fix ` +
      "features/marketing/content-plan/setup/archetypes.ts (never the fixture).",
  );
  process.exit(strict ? 1 : 1);
}
