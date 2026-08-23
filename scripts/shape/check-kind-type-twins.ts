#!/usr/bin/env tsx
/**
 * check-kind-type-twins — THE GATE behind "never a type error"
 * (KINDS_EVERYWHERE_PLAN §10g GAP 1).
 *
 * A registered kind's shape is written down in exactly ONE place: the
 * generated artifact `features/content-ir/kinds/generated/kinds.generated.ts`,
 * produced from the live registry by `pnpm shape:types`. A hand-written
 * interface next to a bridge or a renderer that mirrors a registered kind is a
 * SECOND source of truth — it drifts silently, and the drift shows up as a
 * blank field on a user's screen, never as a compile error. That is exactly
 * what this repo shipped before this gate existed: 33 of 50 kind bridges
 * declared their own payload interfaces while 12 generated files sat unread.
 *
 * Three failures, all blocking:
 *
 *   (a) COVERAGE  — a kind the code names (a bridge's `KindSchema`, a
 *                   `readSearchKindValue<"slug">`, a registry definition) has
 *                   no type in the generated artifact.
 *   (b) STALENESS — the artifact disagrees with the live registry. Registry-
 *                   backed, so it runs only where credentials exist (locally,
 *                   and in CI when the secret is configured); `pnpm
 *                   check:kind-types` is the same check standalone.
 *   (c) TWINS     — a file under the kinds / bridge / renderer paths declares
 *                   an interface whose NAME matches a registered kind and
 *                   whose FIELDS overlap that kind's. Real exceptions live in
 *                   `kind-type-twins-allowlist.json`, which only ever shrinks:
 *                   an entry that no longer matches is itself a failure.
 *
 *   pnpm check:kind-type-twins          # (a) + (c), offline
 *   pnpm check:kind-type-twins --registry   # also (b), needs .env.local
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ARTIFACT = resolve(ROOT, "features/content-ir/kinds/generated/kinds.generated.ts");
const ALLOWLIST = resolve(HERE, "kind-type-twins-allowlist.json");

/**
 * Where a kind payload twin is a defect: the bridges themselves, and every
 * surface that renders a kind. Deliberately narrow — this gate is about the
 * kind pipeline, not about every interface in the repo.
 */
const SCANNED_DIRS = [
  "features/content-ir/kinds",
  "features/content-ir/registry",
  "components/mardown-display/blocks",
];

/** Field-name overlap at or above this ratio counts as "the same shape". */
const OVERLAP_THRESHOLD = 0.6;
/** Below this many fields, a name collision is noise, not a twin. */
const MIN_FIELDS = 3;

interface AllowEntry {
  file: string;
  interface: string;
  kind: string;
  reason: string;
}

/** A kind the code names that the REGISTRY does not carry — with the why. */
interface UnregisteredEntry {
  kind: string;
  declaredIn: string;
  reason: string;
}

interface Declaration {
  file: string;
  name: string;
  fields: string[];
  line: number;
}

const failures: string[] = [];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `keyPoints` / `key_points` / `KeyPoints` all normalize to `keypoints`. */
function normalizeField(name: string): string {
  return name.replace(/[_\-\s]/g, "").toLowerCase();
}

/** `StudyNotesData` → `studynotes`; `study_notes` → `studynotes`. */
function normalizeTypeName(name: string): string {
  return normalizeField(name.replace(/(Data|Payload|Value|Shape|Props|Kind)$/u, ""));
}

// ── the generated artifact ──────────────────────────────────────────────────

interface Artifact {
  /** kind slug → the fields its generated interface declares. */
  fieldsBySlug: Map<string, Set<string>>;
  /** normalized interface name → kind slug. */
  slugByTypeName: Map<string, string>;
  /**
   * Every normalized type name the artifact exports — root kinds AND the
   * shared nested structures. A child kind that lives only as a `$defs` entry
   * of its parent (never its own `kind_definition` row) still HAS a generated
   * type; it just isn't in the slug index.
   */
  exportedNames: Set<string>;
  /** Exported type names verbatim — used for the `Name_OwningKind` disambiguated forms. */
  rawExportedNames: Set<string>;
}

function readArtifact(): Artifact {
  if (!existsSync(ARTIFACT)) {
    console.error(
      "\n  ✗ features/content-ir/kinds/generated/kinds.generated.ts is missing.\n" +
        "    Run: pnpm shape:types\n",
    );
    process.exit(1);
  }
  const source = readFileSync(ARTIFACT, "utf8");

  // Every declared interface and its field names.
  const fieldsByType = new Map<string, Set<string>>();
  const interfaceRe = /^export interface ([A-Za-z0-9_]+) \{\n([\s\S]*?)^\}/gmu;
  for (const match of source.matchAll(interfaceRe)) {
    const fields = new Set<string>();
    for (const field of match[2].matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z_$][\w$]*))\??:/gmu)) {
      const name = field[1] ?? field[2];
      if (name !== "__kind") fields.add(normalizeField(name));
    }
    fieldsByType.set(match[1], fields);
  }

  // The slug → interface index the artifact publishes.
  const indexBlock = /export interface KindPayloadBySlug \{\n([\s\S]*?)^\}/mu.exec(source);
  if (!indexBlock) {
    console.error("\n  ✗ The generated artifact has no KindPayloadBySlug index — regenerate it.\n");
    process.exit(1);
  }
  const fieldsBySlug = new Map<string, Set<string>>();
  const slugByTypeName = new Map<string, string>();
  for (const row of indexBlock[1].matchAll(/^ {2}"([^"]+)": ([A-Za-z0-9_]+);$/gmu)) {
    const [, slug, typeName] = row;
    fieldsBySlug.set(slug, fieldsByType.get(typeName) ?? new Set());
    slugByTypeName.set(normalizeTypeName(typeName), slug);
    slugByTypeName.set(normalizeTypeName(slug), slug);
  }
  const exportedNames = new Set<string>();
  for (const name of fieldsByType.keys()) exportedNames.add(normalizeTypeName(name));
  for (const alias of source.matchAll(/^export type ([A-Za-z0-9_]+) =/gmu)) {
    exportedNames.add(normalizeTypeName(alias[1]));
  }

  // Nested structures count too: a bridge that re-declares `Mnemonic` beside
  // the generated `Mnemonic` is the same defect as one that re-declares a root.
  for (const [name, fields] of fieldsByType) {
    const key = normalizeTypeName(name);
    if (slugByTypeName.has(key)) continue;
    slugByTypeName.set(key, name);
    fieldsBySlug.set(name, fields);
  }

  const rawExportedNames = new Set<string>(fieldsByType.keys());
  for (const alias of source.matchAll(/^export type ([A-Za-z0-9_]+) =/gmu)) {
    rawExportedNames.add(alias[1]);
  }

  return { fieldsBySlug, slugByTypeName, exportedNames, rawExportedNames };
}

// ── the scanned source tree ─────────────────────────────────────────────────

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "generated" || entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/u.test(entry) && !/\.(test|spec|d)\.tsx?$/u.test(entry)) out.push(full);
  }
}

/** Every `interface X { … }` / `type X = { … }` in a file, with its fields. */
function declarationsIn(file: string): Declaration[] {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const declarations: Declaration[] = [];

  const blocks = [
    ...source.matchAll(/^(?:export )?interface ([A-Za-z0-9_]+)(?:<[^>]*>)?\s*(?:extends [^{]+)?\{\n([\s\S]*?)^\}/gmu),
    ...source.matchAll(/^(?:export )?type ([A-Za-z0-9_]+)(?:<[^>]*>)?\s*=\s*\{\n([\s\S]*?)^\};/gmu),
  ];
  for (const block of blocks) {
    const fields: string[] = [];
    for (const field of block[2].matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z_$][\w$]*))\??:/gmu)) {
      const name = field[1] ?? field[2];
      if (name !== "__kind") fields.push(normalizeField(name));
    }
    declarations.push({
      file: rel,
      name: block[1],
      fields,
      line: source.slice(0, block.index ?? 0).split("\n").length,
    });
  }
  return declarations;
}

/** The kind this declaration duplicates, or null. Name-match AND field-overlap. */
function twinOf(declaration: Declaration, artifact: Artifact): { kind: string; overlap: number } | null {
  if (declaration.fields.length < MIN_FIELDS) return null;
  const slug = artifact.slugByTypeName.get(normalizeTypeName(declaration.name));
  if (!slug) return null;
  const registryFields = artifact.fieldsBySlug.get(slug);
  if (!registryFields || registryFields.size === 0) return null;
  const shared = declaration.fields.filter((f) => registryFields.has(f)).length;
  const overlap = shared / declaration.fields.length;
  return overlap >= OVERLAP_THRESHOLD ? { kind: slug, overlap } : null;
}

/** `study_notes` → `StudyNotes` — the generator's own root-naming rule. */
function pascal(slug: string): string {
  return slug
    .split(/[_\-\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// ── (a) coverage: every kind the code names has a generated type ────────────

/** Kind slugs the code declares or renders against. */
function referencedSlugs(files: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    // A TS-owned `KindSchema` declaration, and a renderer naming its kind.
    // A TS-owned `KindSchema` literal only ever appears in the kind bridges
    // and the registry — a `kind:` key anywhere else is a different concept.
    if (rel.startsWith("features/content-ir/")) {
      for (const m of source.matchAll(/^\s*kind: "([a-z][a-z0-9_]*)",$/gmu)) {
        if (!found.has(m[1])) found.set(m[1], rel);
      }
    }
    for (const m of source.matchAll(/readSearchKindValue<"([a-z][a-z0-9_]*)">/gu)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
  }
  return found;
}

// ── main ────────────────────────────────────────────────────────────────────

function main(): void {
  const withRegistry = process.argv.includes("--registry");
  const artifact = readArtifact();

  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(resolve(ROOT, dir), files);

  const allowFile = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
  const allowlist: AllowEntry[] = allowFile.allow;
  const unregistered: UnregisteredEntry[] = allowFile.unregistered ?? [];
  const unregisteredUsed = new Set<string>();
  const allowKey = (file: string, name: string) => `${file}::${name}`;
  const allowed = new Map(allowlist.map((entry) => [allowKey(entry.file, entry.interface), entry]));
  const allowUsed = new Set<string>();

  // (c) twins.
  const twins: string[] = [];
  for (const file of files) {
    for (const declaration of declarationsIn(file)) {
      const twin = twinOf(declaration, artifact);
      if (!twin) continue;
      const key = allowKey(declaration.file, declaration.name);
      if (allowed.has(key)) {
        allowUsed.add(key);
        continue;
      }
      twins.push(
        `  ${declaration.file}:${declaration.line}  interface ${declaration.name} ` +
          `duplicates kind \`${twin.kind}\` (${Math.round(twin.overlap * 100)}% field overlap)`,
      );
    }
  }
  if (twins.length > 0) {
    failures.push(
      `${twins.length} hand-written payload twin(s) of a registered kind:\n${twins.join("\n")}\n\n` +
        "    The generated type is the ONLY declaration of a kind's shape. Import it\n" +
        "    from features/content-ir/kinds/generated/kinds.generated (or the\n" +
        "    kind-payload helpers) and derive a narrower view with Pick/Omit.\n" +
        "    A genuine exception goes in scripts/shape/kind-type-twins-allowlist.json\n" +
        "    with a reason — that list only ever shrinks.",
    );
  }

  // The allowlist may not carry stale entries — that is how it shrinks.
  const stale = allowlist.filter((entry) => !allowUsed.has(allowKey(entry.file, entry.interface)));
  if (stale.length > 0) {
    failures.push(
      `${stale.length} STALE allowlist entr(ies) — the twin is gone, so the exception must go too:\n` +
        stale.map((entry) => `  ${entry.file}::${entry.interface}`).join("\n") +
        "\n\n    Delete them from scripts/shape/kind-type-twins-allowlist.json.",
    );
  }

  // (a) coverage.
  const missing: string[] = [];
  for (const [slug, where] of referencedSlugs(files)) {
    if (artifact.fieldsBySlug.has(slug)) continue;
    // A nested child kind carries its type as a shared `$defs` interface —
    // possibly under a `Name_OwningKind` form when the registry holds two
    // different structures under one def name.
    if (artifact.exportedNames.has(normalizeTypeName(slug))) continue;
    const qualified = `${pascal(slug)}_`;
    if ([...artifact.rawExportedNames].some((name) => name.startsWith(qualified))) continue;
    const excused = unregistered.find((entry) => entry.kind === slug);
    if (excused) {
      unregisteredUsed.add(slug);
      continue;
    }
    missing.push(`  ${slug}  (named by ${where})`);
  }
  if (missing.length > 0) {
    failures.push(
      `${missing.length} kind(s) the code names have NO generated type:\n${missing.join("\n")}\n\n` +
        "    Either the kind is not active in content_ir.kind_definition (register or\n" +
        "    activate it), or the artifact is stale — run: pnpm shape:types",
    );
  }

  const staleUnregistered = unregistered.filter((entry) => !unregisteredUsed.has(entry.kind));
  if (staleUnregistered.length > 0) {
    failures.push(
      `${staleUnregistered.length} STALE "unregistered" exception(s) — the kind now has a type:\n` +
        staleUnregistered.map((entry) => `  ${entry.kind}`).join("\n") +
        "\n\n    Delete them from scripts/shape/kind-type-twins-allowlist.json.",
    );
  }

  // (b) staleness — registry-backed, so only where credentials exist.
  if (withRegistry) {
    try {
      execFileSync("npx", ["tsx", resolve(HERE, "generate-kind-types.ts"), "--check"], {
        cwd: ROOT,
        stdio: "inherit",
      });
    } catch {
      failures.push(
        "the generated artifact is STALE vs the live registry (see above).\n" +
          "    Run: pnpm shape:types, then commit.",
      );
    }
  }

  if (failures.length > 0) {
    console.error("\n  ✗ check:kind-type-twins\n");
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(
    `  ✓ check:kind-type-twins — ${artifact.fieldsBySlug.size} generated kind types, ` +
      `no payload twins in ${files.length} scanned files` +
      (allowlist.length + unregistered.length > 0
        ? `, ${allowlist.length + unregistered.length} allowlisted exception(s)`
        : "") +
      (withRegistry ? ", artifact matches the live registry" : "") +
      ".",
  );
}

main();

export { isRecord };
