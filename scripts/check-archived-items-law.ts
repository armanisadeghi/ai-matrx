#!/usr/bin/env npx tsx
/**
 * check:archived-items-law — every list over an archivable entity carries an
 * archive control, and the default hides archived rows.
 *
 * THE LAW (Arman, 2026-09-09, verbatim — the full text is at
 * ../../common-docs/policies/archived-items.md):
 *
 *   "everything should have an archive filter, and the default should always
 *    hide archived, but seeing archived items should be one or two clicks
 *    away … this is a system wide decision for every single item everywhere in
 *    our system, for every single table and every single page."
 *
 * The two ALLOWED implementations, and no third — BOTH of them live in
 * `@ai-matrx/design-system`, never in this repo (0.13.0 / 0.14.0):
 *   • `ArchiveFilter` (active | archived | all, default active) for
 *     table/browse surfaces. `lib/entity-list` renders it in Filters & Sort and
 *     keeps the URL plumbing, so `query.archived` stays a real server-side RPC
 *     parameter.
 *   • `ArchivedDisclosure` ("Archived (N)", one click, closed by default) for
 *     card lists that are not entity-list shaped.
 * A LOCAL definition of either name is a re-grown twin, which is
 * `pnpm check:package-twins`' job, not this guard's — this one only asks
 * whether a control is PRESENT.
 *
 * WHAT THIS GUARD FAILS ON
 *
 *   1. HARDCODED PREDICATE — a multi-row Supabase read of a table that carries
 *      `is_archived` / `archived_at` whose archive predicate is a literal
 *      (`.eq("is_archived", false)`, `.is("archived_at", null)`) with no
 *      option, parameter, or state anywhere in the file that could ever flip
 *      it. That is "hidden with zero clicks to reveal" — the exact shape the
 *      law outlaws.
 *   2. COLUMN WITHOUT A CONTROL — a multi-row read that SELECTS the archive
 *      column (so the rows reaching the UI are knowingly mixed) in a file that
 *      offers no archive control at all. That is "archived and active mixed,
 *      unlabelled" — the other half of the census's failure modes.
 *   3. ARCHIVE-BLIND READER OF AN ENTITY THIS REPO ALREADY TREATS LAWFULLY —
 *      a list read that neither filters the archive column nor projects it, of
 *      an entity whose lists elsewhere in this repo DO carry the control. The
 *      class is settled for that entity, so a reader that cannot even tell an
 *      archived row from a live one is a regression, and nothing downstream
 *      could offer the control on its behalf. This is the shape row F9 shipped
 *      (`features/pdf/scanner/processing.ts` listed `processed_documents`
 *      filtering `deleted_at` alone, while the PDF Studio sidebar and the
 *      extractor history — the same entity — had already been fixed). The
 *      precedent set is DERIVED from the tree, never hand-listed: it grows as
 *      the campaign closes entities, and it is why this rule reports a handful
 *      of true findings instead of a hundred reads of entities nobody has
 *      ruled on yet.
 *
 * WHAT IT DELIBERATELY DOES NOT FAIL ON
 *
 *   • Single-record reads (`.single()`, `.maybeSingle()`, `.eq("id", …)`,
 *     `count: "exact", head: true`). One record is not a list; hiding an
 *     archived record from a by-id lookup is a different question the law does
 *     not legislate.
 *   • `deleted_at` (soft delete). Deletion is not archiving — db-rules §6d.
 *   • Writes (`.update`, `.insert`, `.upsert`, `.delete`).
 *   • A query whose file carries a real control (`includeArchived`,
 *     `showArchived`, `archiveFilter`, `ArchiveFilter`, `ArchivedFilter`,
 *     `ArchivedDisclosure`,
 *     `p_include_archived`, …). The guard checks that a control EXISTS and is
 *     wired to the predicate; whether the pixels are right is a browser
 *     verification, not a static one.
 *
 * WHAT IT CANNOT SEE (say so, never let a green run imply more than it proves)
 *
 *   1. A service that ALREADY exposes an archive option which no caller ever
 *      passes reads as green here — the option exists, so the query is not
 *      hardcoded. `features/page-extraction/api/jobs.ts` shipped exactly that
 *      for months: `includeArchived` in the signature, no UI able to set it.
 *      Wiring a control to a visible affordance is proven in the browser, on
 *      the surface, not by this file.
 *   2. AN UNORDERED MULTI-ROW READ. Rule 3 requires `.order` / `.limit` /
 *      `.range` (`LIST_SHAPED`) to call a chain a list, so a read that returns
 *      many rows with no ordering — `.select(...).eq("org_id", x)` — is
 *      invisible to it. Dropping the requirement makes every `.in(...)` batch
 *      hydration a finding, which is how a guard gets deleted. STILL OPEN,
 *      deliberately; a browser pass is what covers it.
 *   3. Whether a control is actually REACHABLE on screen. That is always a
 *      browser verification.
 *
 * WHAT IT USED TO MISS AND NO LONGER DOES (2026-09-10, row F10 repair — each
 * proven forcing against the previous version of this file):
 *
 *   • A BLIND READ BESIDE A LAWFUL ONE. `fileHasControl` whitelisted every
 *     query in a file, so one controlled list made its archive-blind
 *     neighbours read green — `features/masterwork/encore/service.ts:59`'s
 *     exact shape, which is why F10's census missed it. Control is now
 *     attributed to the DECLARATION the query is written in (`declBlock`).
 *     PRECEDENT stays file-level on purpose; see `lawfulEntitiesIn`.
 *   • A NAMED SELECT CONSTANT. `.select(MASTERWORK_SELECT_COLUMNS)` hands the
 *     archive column downstream, but a scan that reads only string literals
 *     called it archive-blind. `selectConstants` resolves the constant.
 *   • AN AMBIGUOUS SCHEMA-LESS READ. `.from("definition")` with no `.schema()`
 *     keys to `?.definition`; the day a control-carrying file made such a read,
 *     `?.definition` joined the precedent set and
 *     `app/(core)/organizations/[orgId]/agent-apps/page.tsx:16` — which reads
 *     `app.definition`, a table with NO archive column — became a false
 *     positive. Ambiguous keys now neither set nor answer to rule 3.
 *   • A SCHEMA APPLIED INSIDE A HELPER (recorded by an independent review and
 *     closed the same day). `schemaFor` only ever saw a `.schema("x")` written
 *     in the statement itself, so every read through the ten-strong
 *     `utils/supabase/*Db.ts` family (`appDb`, `docprocDb`, `iamDb`, `ragDb`,
 *     `pdfDb`, `codeDb`, `webDb`, `contextDb`, `schedulerDb`, `workspaceDb`)
 *     resolved to `?.table` — and an ambiguous key can neither settle a class
 *     nor answer to rule 3. The day one of those schemas gained an archivable
 *     table, every read of it would have been PERMANENTLY invisible while the
 *     run stayed green. `schemaHelpers` derives `helper → schema` from the tree
 *     on every run and `helperSchemaFor` resolves both shapes the tree writes
 *     (applied inline, and bound to a name first). Measured after: the same 0
 *     findings and the same 4 settled entities, with 10 helpers resolved.
 *
 * ESCAPE HATCH: an internal reader that genuinely must not offer a control
 * (a machine path, a lineage walk, a health probe) declares it at the query:
 *
 *     // archived-items-law-exempt: run-launcher fetch, not a user-facing list
 *
 * with 12+ characters of reason. A bare marker does not count.
 *
 * The archivable-entity set is DERIVED from `types/database.types.ts`, never
 * hand-listed — a new table with an archive column is covered the day
 * `pnpm db-types` runs, with nobody remembering to update this file. It is
 * keyed by SCHEMA and table, because four different schemas own a table called
 * `definition` and only two of them carry an archive column: a scan that keyed
 * on the bare name called every `tool.definition` and `app.definition` read a
 * finding. A chain that names no schema resolves by unique table name, and
 * stays conservative (treated as the archivable entity) when the name is
 * ambiguous.
 *
 * Run: pnpm check:archived-items-law
 * Prove the detector: pnpm check:archived-items-law:self-test
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const DB_TYPES = path.join(ROOT, "types", "database.types.ts");

const ARCHIVE_COLUMNS = ["is_archived", "archived_at"] as const;

const EXEMPTION = /archived-items-law-exempt:\s*(.{12,})/;

/**
 * Anything that could ever flip the archive predicate. Presence in the file is
 * the "a control exists" test; the browser check is what proves it is wired to
 * a visible affordance.
 */
const CONTROL_SIGNALS: readonly RegExp[] = [
  /\binclude_?[Aa]rchived\b/,
  /\bshow_?[Aa]rchived\b/,
  /\bwith_?[Aa]rchived\b/,
  /\barchive[dD]?Filter\b/,
  // The package's own export names (@ai-matrx/design-system 0.13.0 / 0.14.0).
  // A surface adopting the ONE control imports THESE — a detector that only
  // knew the deleted local names would have started reading adoption as
  // absence the moment the components moved into the package.
  /\bArchivedFilter\b/,
  /\bArchiveFilter\b/,
  /\bArchiveFilterValue\b/,
  /\bArchivedDisclosure\b/,
  /\bDEFAULT_ARCHIVE_FILTER\b/,
  /\btoArchiveFilter\b/,
  /\bp_include_archived\b/,
  /\barchivedDefault\b/,
  /\bvisibleArchived\b/,
  /\barchivedOnly\b/,
];

/**
 * A chain carrying one of these is a single-record read, not a list.
 *
 * The `(?:<[^;]*?>)?` is load-bearing: this codebase writes
 * `.maybeSingle<{ id: string }>()`, and a pattern that demanded `(` right
 * after the method name called every one of those a list.
 */
const SINGLE_RECORD_SIGNALS: readonly RegExp[] = [
  /\.maybeSingle\s*(?:<[^;]*?>)?\s*\(/,
  /\.single\s*(?:<[^;]*?>)?\s*\(/,
  /\.eq\s*\(\s*['"`]id['"`]\s*,/,
  /head\s*:\s*true/,
];

/** A chain carrying one of these is a write, not a read. */
const WRITE_SIGNALS: readonly RegExp[] = [
  /\.update\s*\(/,
  /\.insert\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
];

const HARDCODED_PREDICATE =
  /\.(?:eq|is)\s*\(\s*['"`](is_archived|archived_at)['"`]\s*,\s*(?:false|true|null)\s*\)/;

// ── Comment stripping (borrowed shape from check-canonical-pickers) ─────────
// Offsets — and therefore reported line numbers — are preserved. Nothing in a
// comment may trip the guard OR whitelist a file; the ONE exception is the
// exemption marker, which is read from the RAW text on purpose.
function stripComments(text: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + " ".repeat(match.length - lead.length),
    );
}

// ── The archivable-entity set, derived from the generated types ─────────────

/**
 * Table names whose `Row` carries `is_archived` or `archived_at`.
 *
 * `database.types.ts` nests `schema → Tables → <table> → Row → <column>` at
 * fixed indentation, so a line scanner is exact and costs one pass over a
 * 100k-line file. A regex over the whole blob would happily match an Insert or
 * an unrelated nested type.
 */
export type ArchivableEntities = Map<string, Set<string>>;

/**
 * `table → the schemas that own an archivable table of that name`.
 *
 * Schema matters: `agent.definition` and `workflow.definition` carry
 * `is_archived`; `tool.definition` and `app.definition` do not. Keying on the
 * bare name reported every tool-registry read in the repo as a violation.
 */
export function archivableEntities(dbTypesText: string): ArchivableEntities {
  const entities: ArchivableEntities = new Map();
  let currentSchema: string | null = null;
  let currentTable: string | null = null;
  let inRow = false;

  for (const line of dbTypesText.split("\n")) {
    const schemaMatch = /^ {2}(\w+): \{$/.exec(line);
    if (schemaMatch?.[1]) {
      currentSchema = schemaMatch[1];
      continue;
    }
    const tableMatch = /^ {6}(\w+): \{$/.exec(line);
    if (tableMatch?.[1]) {
      currentTable = tableMatch[1];
      inRow = false;
      continue;
    }
    if (currentTable && /^ {8}Row: \{$/.test(line)) {
      inRow = true;
      continue;
    }
    if (inRow && /^ {8}\}/.test(line)) {
      inRow = false;
      continue;
    }
    if (inRow && currentTable && currentSchema) {
      const column = /^ {10}(\w+)[?]?:/.exec(line)?.[1];
      if (column && (ARCHIVE_COLUMNS as readonly string[]).includes(column)) {
        const schemas = entities.get(currentTable) ?? new Set<string>();
        schemas.add(currentSchema);
        entities.set(currentTable, schemas);
      }
    }
  }
  return entities;
}

export function archivableTables(dbTypesText: string): Set<string> {
  const tables = new Set<string>();
  let currentTable: string | null = null;
  let inRow = false;

  for (const line of dbTypesText.split("\n")) {
    const tableMatch = /^ {6}(\w+): \{$/.exec(line);
    if (tableMatch?.[1]) {
      currentTable = tableMatch[1];
      inRow = false;
      continue;
    }
    if (currentTable && /^ {8}Row: \{$/.test(line)) {
      inRow = true;
      continue;
    }
    if (inRow && /^ {8}\}/.test(line)) {
      inRow = false;
      continue;
    }
    if (inRow && currentTable) {
      const column = /^ {10}(\w+)[?]?:/.exec(line)?.[1];
      if (column && (ARCHIVE_COLUMNS as readonly string[]).includes(column)) {
        tables.add(currentTable);
      }
    }
  }
  return tables;
}

// ── Scanning ───────────────────────────────────────────────────────────────

export interface Finding {
  file: string;
  line: number;
  table: string;
  reason: string;
}

function lineFor(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

function anyMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * The ONE statement a `.from("table")` belongs to: from the start of its line
 * to the `;` that ends the chain (capped, for an unterminated tail).
 *
 * 🚨 The window MUST stop at the statement boundary. A fixed character budget
 * let a chain 40 lines above borrow the archive predicate of the query below
 * it, which reported the wrong file:line and — worse — could hide a real
 * finding behind a neighbour's predicate.
 */
const CHAIN_BUDGET = 2400;

function chainWindow(code: string, fromIndex: number): string {
  const lineStart = code.lastIndexOf("\n", fromIndex) + 1;
  const hardEnd = Math.min(code.length, fromIndex + CHAIN_BUDGET);
  const semicolon = code.indexOf(";", fromIndex);
  const end = semicolon >= 0 ? Math.min(semicolon + 1, hardEnd) : hardEnd;
  return code.slice(lineStart, end);
}

/** A chain carrying one of these is a list, not a lookup of one known row. */
const LIST_SHAPED = /\.(?:order|limit|range)\s*\(/;

/** `.select("*")` hands EVERY column, archive column included, to the caller. */
const SELECT_STAR = /\.select\s*\(\s*['"`]\s*\*/;

/**
 * The schema a `.from(table)` at `fromIndex` reads, when the statement names
 * one (`.schema("agent").from("definition")`). `null` when it does not — helper
 * wrappers such as `docprocDb(supabase)` bind the schema elsewhere.
 */
function schemaFor(code: string, fromIndex: number): string | null {
  const start =
    Math.max(
      code.lastIndexOf(";", fromIndex),
      code.lastIndexOf("{", fromIndex),
      code.lastIndexOf("}", fromIndex),
    ) + 1;
  const segment = code.slice(start, fromIndex);
  const names = [...segment.matchAll(/\.schema\s*\(\s*['"`](\w+)['"`]\s*\)/g)];
  return names.length > 0 ? (names[names.length - 1]?.[1] ?? null) : null;
}

/**
 * The `utils/supabase/*Db.ts` family — `export function docprocDb(client) {
 * return client.schema("docproc"); }` — as `helperName → schema`.
 *
 * 🚨 THE LIMIT THIS CLOSES (recorded by an independent review, 2026-09-10,
 * closed the same day). `schemaFor` only sees a `.schema("x")` written in the
 * statement itself, so every read through one of these helpers resolved to the
 * ambiguous `?.table` — and an ambiguous key can neither settle a class nor
 * answer to rule 3. Ten such helpers exist (`appDb`, `docprocDb`, `iamDb`,
 * `ragDb`, `pdfDb`, `codeDb`, `webDb`, `contextDb`, `schedulerDb`,
 * `workspaceDb`), so the day any of their schemas gains an archivable table,
 * every read of it would have been PERMANENTLY invisible to the guard while the
 * run stayed green. The map is DERIVED from the tree on every run, exactly like
 * the precedent set, so a new helper needs no edit here.
 */
export function schemaHelpers(
  files: readonly { file: string; raw: string }[],
): Map<string, string> {
  const helpers = new Map<string, string>();
  const pattern =
    /export\s+function\s+([A-Za-z_$][\w$]*)[\s\S]{0,300}?return\s+[A-Za-z_$][\w$]*\s*\.schema\s*\(\s*['"`](\w+)['"`]\s*\)/g;
  for (const { file, raw } of files) {
    if (!/^utils\/supabase\//.test(file)) continue;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      if (match[1] && match[2]) helpers.set(match[1], match[2]);
    }
  }
  return helpers;
}

/**
 * The schema a helper binds to THIS `.from(...)`, in the two shapes the tree
 * actually writes: applied inline (`docprocDb(supabase).from("x")`) and bound
 * to a name first (`const db = docprocDb(supabase); … db.from("x")`).
 */
function helperSchemaFor(
  code: string,
  fromIndex: number,
  helpers: ReadonlyMap<string, string>,
): string | null {
  if (helpers.size === 0) return null;

  // Inline: the helper call is in the same statement, before `.from(`.
  const start =
    Math.max(
      code.lastIndexOf(";", fromIndex),
      code.lastIndexOf("{", fromIndex),
      code.lastIndexOf("}", fromIndex),
    ) + 1;
  const segment = code.slice(start, fromIndex);
  const calls = [...segment.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)];
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const name = calls[i]?.[1];
    const schema = name ? helpers.get(name) : undefined;
    if (schema) return schema;
  }

  // Bound to a name: resolve the receiver (`db` in `db.from(`) to its
  // declaration anywhere in the file. Bounded and exact — one hop, never a
  // chain, so it cannot invent a schema for an alias of an alias.
  // `fromIndex` points AT the `.` of `.from(`, so the receiver is the last
  // identifier BEFORE it — `db` in `await db\n  .from("x")`. (Requiring a
  // trailing dot here matched nothing and left this whole branch dead.)
  const receiver = /([A-Za-z_$][\w$]*)\s*$/.exec(
    code.slice(Math.max(0, fromIndex - 80), fromIndex),
  )?.[1];
  if (!receiver) return null;
  const declaration = new RegExp(
    `\\b(?:const|let|var)\\s+${receiver}\\s*(?::[^=;]+)?=\\s*(?:await\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(`,
  ).exec(code);
  const bound = declaration?.[1];
  return bound ? (helpers.get(bound) ?? null) : null;
}

/**
 * `schema.table` when this read is of an archivable entity, `null` when it is
 * not. An unnamed schema resolves by a helper's binding, then by unique table
 * name; a genuinely ambiguous one stays conservative (`?.table`) rather than
 * letting a real finding through.
 */
export function entityKeyFor(
  code: string,
  fromIndex: number,
  table: string,
  entities: ArchivableEntities,
  helpers: ReadonlyMap<string, string> = new Map(),
): string | null {
  const schemas = entities.get(table);
  if (!schemas) return null;
  const named = schemaFor(code, fromIndex) ?? helperSchemaFor(code, fromIndex, helpers);
  if (named) return schemas.has(named) ? `${named}.${table}` : null;
  const only = schemas.size === 1 ? [...schemas][0] : null;
  return only ? `${only}.${table}` : `?.${table}`;
}

/**
 * `const NAME = "id, name, is_archived";` — the string constants a `.select()`
 * can be handed instead of a literal.
 *
 * Without this the guard cannot see the projection of
 * `.select(MASTERWORK_SELECT_COLUMNS)`, so a read that DOES hand the archive
 * column downstream looks archive-blind (LIMITS, 2026-09-10). Cheap, exact,
 * and it removes a false-positive class rather than adding findings.
 */
export function selectConstants(code: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(['"`])([\s\S]{0,2000}?)\2\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    if (match[1] && match[3] !== undefined) constants.set(match[1], match[3]);
  }
  return constants;
}

/** A top-level declaration — the unit a query's archive control is judged in. */
const TOP_LEVEL_DECL =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\b/gm;

/**
 * The top-level declaration (function / component / const) a `.from(` sits in.
 *
 * 🚨 PER-QUERY CONTROL ATTRIBUTION (LIMITS, closed 2026-09-10). Until this
 * existed the guard asked whether the FILE mentioned a control anywhere, so
 * one lawful query whitelisted every other query beside it — an archive-blind
 * list living next to a controlled one read GREEN. That is exactly how
 * `features/masterwork/encore/service.ts:59` survived the F10 census: it sits
 * in a file whose sibling reads were lawful. The unit is now the declaration
 * the query is written in, which is where a service's `includeArchived`
 * parameter and a component's `showArchived` state both live.
 */
export function declBlock(code: string, index: number): string {
  TOP_LEVEL_DECL.lastIndex = 0;
  let start = 0;
  let end = code.length;
  let match: RegExpExecArray | null;
  while ((match = TOP_LEVEL_DECL.exec(code)) !== null) {
    if (match.index <= index) start = match.index;
    else {
      end = match.index;
      break;
    }
  }
  return code.slice(start, end);
}

export function scanFile(
  file: string,
  raw: string,
  entities: ArchivableEntities,
  /**
   * Entities (`schema.table`) whose lists ALREADY carry an archive control
   * somewhere in this repo — the settled classes rule 3 protects. Omitted (the
   * self-test's default) means "no precedent", so rule 3 stays quiet.
   */
  lawfulEntities: ReadonlySet<string> = new Set(),
  /**
   * `helperName → schema` for the `utils/supabase/*Db.ts` family, so a read
   * through one of them resolves to a real entity instead of the ambiguous
   * `?.table` (see `schemaHelpers`). Defaults to none, which is the old
   * behaviour and what the self-test's hand-written fixtures expect.
   */
  helpers: ReadonlyMap<string, string> = new Map(),
): Finding[] {
  const code = stripComments(raw);
  const findings: Finding[] = [];
  const constants = selectConstants(code);

  const fromPattern = /\.from\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = fromPattern.exec(code)) !== null) {
    const table = match[1];
    if (!table) continue;
    const entity = entityKeyFor(code, match.index, table, entities, helpers);
    if (!entity) continue;

    const window = chainWindow(code, match.index);
    if (anyMatch(window, WRITE_SIGNALS)) continue;
    if (anyMatch(window, SINGLE_RECORD_SIGNALS)) continue;

    // The exemption is read from the RAW text (it lives in a comment) within
    // the same neighbourhood as the query.
    const rawWindowStart = Math.max(0, match.index - 600);
    const rawWindow = raw.slice(rawWindowStart, match.index + CHAIN_BUDGET);
    if (EXEMPTION.test(rawWindow)) continue;

    const line = lineFor(code, match.index);
    const predicate = HARDCODED_PREDICATE.exec(window);
    // Per-query, not per-file: the control must live in the same top-level
    // declaration as the query it is supposed to govern.
    const hasControl = anyMatch(declBlock(code, match.index), CONTROL_SIGNALS);

    if (predicate && !hasControl) {
      findings.push({
        file,
        line,
        table,
        reason:
          `list read of \`${table}\` hardcodes \`${predicate[0].trim()}\` with no ` +
          "archive control anywhere in the file — archived rows are impossible to reveal",
      });
      continue;
    }

    // RULE 2 — THE SCREEN THAT LIES. A component that fetches its own rows,
    // NAMES the archive column in its select (so it knows perfectly well which
    // rows are archived), renders them itself, and still offers no control:
    // archived and active land in one list, indistinguishable.
    //
    // Scoped this tightly on purpose. A `service.ts` selecting the column is
    // doing the RIGHT thing — handing it to a caller that owns the control —
    // and a container that fetches and passes rows down is not the surface
    // either. A rule that fires on every layered service is a rule agents
    // delete instead of obey.
    const rendersRows = file.endsWith(".tsx") && /\.map\s*\(/.test(code);
    const selectedConstant = /\.select\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(
      window,
    )?.[1];
    const constantProjection = selectedConstant
      ? (constants.get(selectedConstant) ?? "")
      : "";
    const projectsArchiveColumn =
      SELECT_STAR.test(window) ||
      ARCHIVE_COLUMNS.some(
        (column) =>
          new RegExp(`\\.select\\s*\\([\\s\\S]{0,600}?\\b${column}\\b`).test(
            window,
          ) || new RegExp(`\\b${column}\\b`).test(constantProjection),
      );
    if (!predicate && !hasControl && rendersRows && projectsArchiveColumn) {
      findings.push({
        file,
        line,
        table,
        reason:
          `list read of \`${table}\` selects its archive column, renders the rows, and ` +
          "offers no archive control — archived and active render mixed and unlabelled",
      });
      continue;
    }

    // RULE 3 — THE ARCHIVE-BLIND READER OF A SETTLED CLASS. This list read
    // neither filters the archive column nor projects it, so nothing it hands
    // downstream can tell an archived row from a live one — and the entity is
    // one whose lists elsewhere in this repo already carry the control. The
    // class is settled; this reader is the regression. (Row F9, 2026-09-09:
    // `fetchRecentScans` listed `processed_documents` filtering `deleted_at`
    // alone, months after the PDF Studio sidebar over the same entity was
    // fixed.) An entity nobody has ruled on yet is NOT reported here — this
    // guard states what it has proven, never what it suspects.
    if (
      !predicate &&
      !hasControl &&
      !projectsArchiveColumn &&
      LIST_SHAPED.test(window) &&
      // An AMBIGUOUS key (`?.table` — a schema-less read of a table name two
      // schemas own) can never carry rule 3: the precedent it would be judged
      // against was set by a DIFFERENT schema's table. Reporting it would make
      // `app/(core)/organizations/[orgId]/agent-apps/page.tsx:16` (which reads
      // `app.definition`, a table with no archive column at all) a false
      // positive the day any control-carrying file makes a schema-less
      // `definition` read. LIMITS, closed 2026-09-10.
      !entity.startsWith("?.") &&
      lawfulEntities.has(entity)
    ) {
      findings.push({
        file,
        line,
        table,
        reason:
          `list read of \`${entity}\` neither filters nor selects the archive column, so ` +
          "archived rows render indistinguishable from live ones — and this repo already " +
          "gives that entity's lists an archive control elsewhere",
      });
    }
  }

  return findings;
}

/**
 * The entities whose lists this repo ALREADY treats lawfully: an entity read in
 * a file that carries an archive control. Derived from the tree on every run,
 * so closing a class automatically widens rule 3's cover to the rest of it.
 */
/**
 * 🚨 PRECEDENT IS FILE-LEVEL ON PURPOSE, and judgment is not.
 *
 * `scanFile` attributes a control to the DECLARATION the query is written in,
 * because that is the question "is THIS list controlled?". This function asks a
 * different one — "has this repo ruled on this entity at all?" — and a class is
 * settled by the campaign, not by one query's neighbourhood. Narrowing it to
 * the declaration measurably dropped `agent.definition` out of the precedent
 * set (its in-tree control lives in `lib/entity-list` and the package pickers,
 * not beside a `.from("definition")` chain), which would have silently switched
 * rule 3 off for the whole agent catalogue. Wider precedent + per-query
 * judgment is the combination that keeps rule 3 both true and useful.
 */
export function lawfulEntitiesIn(
  files: readonly { file: string; raw: string }[],
  entities: ArchivableEntities,
  helpers: ReadonlyMap<string, string> = new Map(),
): Set<string> {
  const lawful = new Set<string>();
  for (const { raw } of files) {
    const code = stripComments(raw);
    if (!anyMatch(code, CONTROL_SIGNALS)) continue;
    const fromPattern = /\.from\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = fromPattern.exec(code)) !== null) {
      const table = match[1];
      if (!table) continue;
      const entity = entityKeyFor(code, match.index, table, entities, helpers);
      // An ambiguous `?.table` read cannot settle a class: nobody can say
      // which schema's entity it proved.
      if (entity && !entity.startsWith("?.")) lawful.add(entity);
    }
  }
  return lawful;
}

function sourceFiles(): string[] {
  const out = execSync(
    "git ls-files --cached --others --exclude-standard '*.ts' '*.tsx'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) =>
      /^(app|components|features|hooks|lib|utils|providers)\//.test(file),
    )
    .filter((file) => !/\.(test|spec)\.tsx?$/.test(file));
}

// ── Self-test ──────────────────────────────────────────────────────────────

const SELF_TEST_TABLES: ArchivableEntities = new Map([
  ["template", new Set(["agent"])],
  ["canvas_items", new Set(["platform"])],
  ["employees", new Set(["hr"])],
  // Several schemas own a `definition`; only some of them archive. The scan
  // must tell them apart (`tool.definition` is not our business), and a
  // SCHEMA-LESS read of an ambiguous name must not be judged against a
  // precedent set by a different schema's table.
  ["definition", new Set(["agent", "workflow"])],
]);

/** The settled classes rule 3 protects, for the self-test. */
const SELF_TEST_LAWFUL = new Set([
  "platform.canvas_items",
  "agent.definition",
]);

/** RED — exactly the shape `/agents/templates` shipped before 2026-09-09. */
const RED_HARDCODED = `
const { data } = await supabase
  .schema("agent")
  .from("template")
  .select("id, name, is_featured")
  .is("deleted_at", null)
  .eq("is_archived", false)
  .order("use_count", { ascending: false });
`;

/** RED — a component that fetches its own rows, renders them, and offers no
 *  control: archived and active land in one unlabelled list. */
const RED_COLUMN_NO_CONTROL = `
export function Panel() {
  const { data } = await supabase
    .schema("platform")
    .from("canvas_items")
    .select("id, title, archived_at")
    .eq("organization_id", orgId);
  return <ul>{data.map((row) => <li key={row.id}>{row.title}</li>)}</ul>;
}
`;

/** GREEN — the predicate is driven by an option the UI can flip. */
const GREEN_CONTROLLED = `
let query = db.from("template").select("*");
if (!opts.includeArchived) {
  query = query.eq("is_archived", false);
}
`;

/** GREEN — client-side split, whole corpus loaded, disclosure renders it. */
const GREEN_DISCLOSURE = `
import { ArchivedDisclosure } from "@ai-matrx/design-system";
const { data } = await supabase.from("canvas_items").select("id, is_archived");
`;

/** GREEN — a service hands the archive column to a caller that owns the
 *  control. Flagging this would fire on every layered feature in the repo. */
const GREEN_SERVICE_LAYER = `
export async function listFields(orgId: string) {
  const { data } = await supabase
    .schema("platform")
    .from("canvas_items")
    .select("id, title, archived_at")
    .eq("organization_id", orgId);
  return data;
}
`;

/** GREEN — a single record is not a list, generic type args included. */
const GREEN_SINGLE = `
const { data } = await supabase
  .from("template")
  .select("id")
  .eq("created_by", uid)
  .eq("is_archived", false)
  .limit(1)
  .maybeSingle<{ id: string }>();
`;

/** GREEN — a write is not a list. */
const GREEN_WRITE = `
await supabase.from("template").update({ is_archived: true }).eq("id", id);
`;

/** GREEN — a declared, reasoned exemption. */
const GREEN_EXEMPT = `
// archived-items-law-exempt: run-launcher hydration, never rendered as a list
const { data } = await supabase
  .from("template")
  .select("*")
  .eq("is_archived", false);
`;

/** GREEN — an unrelated table with no archive column is not our business. */
const GREEN_OTHER_TABLE = `
const { data } = await supabase.from("widgets").select("*").eq("is_archived", false);
`;

/** RED — row F9's exact shape: a list read of a SETTLED entity that neither
 *  filters nor projects the archive column, so archived rows arrive unmarked. */
const RED_ARCHIVE_BLIND = `
export interface RecentRow { id: string; name: string }
export async function fetchRecent(limit = 12): Promise<RecentRow[]> {
  const { data } = await db
    .from("canvas_items")
    .select("id, name, created_at, metadata")
    .is("deleted_at", null)
    .eq("owner_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}
`;

/** GREEN — the same blind shape over an entity NOBODY has ruled on yet. Rule 3
 *  reports settled classes only; it never guesses at the rest. */
const GREEN_ARCHIVE_BLIND_UNSETTLED = `
const { data } = await db
  .from("template")
  .select("id, name")
  .order("created_at", { ascending: false })
  .limit(10);
`;

/** GREEN — `select("*")` hands the archive column to the caller, so the reader
 *  is not blind (the transcript-studio service shape). */
const GREEN_SELECT_STAR = `
const { data } = await db
  .from("canvas_items")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });
`;

/** GREEN — a different schema's table of the same name has no archive column,
 *  and calling every tool-registry read a violation is how a guard gets
 *  deleted. */
const GREEN_OTHER_SCHEMA = `
const { data } = await client
  .schema("tool")
  .from("definition")
  .select("id, name, category")
  .order("name", { ascending: true });
`;

/** RED — a comment mentioning a control must not whitelist a hard predicate. */
const RED_COMMENT_ONLY_CONTROL = `
// TODO: add a showArchived toggle here one day
const { data } = await supabase
  .from("template")
  .select("*")
  .eq("is_archived", false);
`;

/**
 * RED — THE HOLE PER-QUERY ATTRIBUTION CLOSES (LIMITS, 2026-09-10). One lawful,
 * controlled read and one archive-blind read of the same settled entity, in the
 * same file. Under the old file-level `fileHasControl` the blind one read
 * GREEN; this is `features/masterwork/encore/service.ts`'s shape exactly.
 */
const RED_BLIND_BESIDE_LAWFUL = `
export async function listBoards(opts: { includeArchived?: boolean } = {}) {
  let query = db.from("canvas_items").select("id, name").order("created_at");
  if (!opts.includeArchived) query = query.eq("is_archived", false);
  return (await query).data;
}

export async function releasedBase() {
  const { data } = await db
    .from("canvas_items")
    .select("id, name")
    .not("released_at", "is", null)
    .order("updated_at", { ascending: false });
  return data;
}
`;

/**
 * GREEN — the projection is a named constant, not a literal (LIMITS,
 * 2026-09-10). `features/masterwork/service.ts` selects
 * `MASTERWORK_SELECT_COLUMNS`, which names `is_archived`; a scan that only
 * reads literals calls that hand-off archive-blind.
 */
const GREEN_SELECT_CONSTANT = `
const COLUMNS = "id,name,metadata,is_archived";
export async function listThings() {
  const { data } = await db
    .from("canvas_items")
    .select(COLUMNS)
    .order("updated_at", { ascending: false });
  return data;
}
`;

/**
 * GREEN — a SCHEMA-LESS read of a table name more than one schema owns. The
 * precedent was set by `agent.definition`; this read may be `workflow`'s, or
 * (as at `app/(core)/organizations/[orgId]/agent-apps/page.tsx:16`) a schema
 * whose `definition` has no archive column at all. Rule 3 states what it has
 * proven, and it has not proven which entity this is.
 */
const GREEN_AMBIGUOUS_SCHEMA_BLIND = `
export async function fetchOwned(orgId: string) {
  const res = await appDb(supabase)
    .from("definition")
    .select("id, name, tagline")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return res.data;
}
`;

/**
 * The `utils/supabase/*Db.ts` family the real tree ships, as the scanner's
 * derivation would see it. `schemaHelpers` must find BOTH — a generic
 * signature is what a naive `<...>` pattern chokes on.
 */
const HELPER_SOURCE = `
import type { SupabaseClient } from "@supabase/supabase-js";
/** A supabase client scoped to the \`agent\` schema. */
export function agentDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("agent");
}
export function toolDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("tool");
}
`;

/**
 * RED ONLY ONCE HELPERS RESOLVE — an archive-blind list read of a SETTLED
 * entity, reached through a schema-binding helper instead of an inline
 * `.schema()`. Before 2026-09-10 this keyed to `?.definition` and rule 3 could
 * not see it at all, which is the limit an independent review recorded.
 */
const RED_HELPER_BOUND_BLIND = `
const db = agentDb(supabase);
export async function listAgents() {
  const { data } = await db
    .from("definition")
    .select("id, name")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return data;
}
`;

/** The same shape applied inline rather than bound to a name. */
const RED_HELPER_INLINE_BLIND = `
export async function listAgentsInline() {
  const { data } = await agentDb(supabase)
    .from("definition")
    .select("id, name")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return data;
}
`;

/**
 * GREEN — the SAME shape through a helper that binds a schema whose
 * `definition` has no archive column. Resolving helpers must not turn every
 * `tool.definition` read into a finding; that is the false-positive class the
 * ambiguous `?.` key was protecting against, and it must stay closed.
 */
const GREEN_HELPER_OTHER_SCHEMA = `
const db = toolDb(supabase);
export async function listTools() {
  const { data } = await db
    .from("definition")
    .select("id, name")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return data;
}
`;

function selfTest(): void {
  const failures: string[] = [];
  const helpers = schemaHelpers([
    { file: "utils/supabase/selfTestDb.ts", raw: HELPER_SOURCE },
  ]);
  const scan = (source: string, file = "self-test.ts") =>
    scanFile(file, source, SELF_TEST_TABLES, SELF_TEST_LAWFUL, helpers);

  const expectRed = (name: string, source: string, file?: string) => {
    if (scan(source, file).length === 0) {
      failures.push(
        `${name}: the detector stayed GREEN on a source that breaks the law — ` +
          "a guard that cannot fail proves nothing.",
      );
    }
  };
  const expectGreen = (name: string, source: string, file?: string) => {
    const found = scan(source, file);
    if (found.length > 0) {
      failures.push(
        `${name}: false positive — ${found[0]?.reason}. False positives get guards deleted.`,
      );
    }
  };

  expectRed("HARDCODED", RED_HARDCODED);
  expectRed("COLUMN-NO-CONTROL", RED_COLUMN_NO_CONTROL, "self-test.tsx");
  expectRed("COMMENT-ONLY-CONTROL", RED_COMMENT_ONLY_CONTROL);
  expectRed("ARCHIVE-BLIND", RED_ARCHIVE_BLIND);
  expectRed("BLIND-BESIDE-LAWFUL", RED_BLIND_BESIDE_LAWFUL);
  expectRed("HELPER-BOUND-BLIND", RED_HELPER_BOUND_BLIND);
  expectRed("HELPER-INLINE-BLIND", RED_HELPER_INLINE_BLIND);
  expectGreen("HELPER-OTHER-SCHEMA", GREEN_HELPER_OTHER_SCHEMA);
  if (helpers.get("agentDb") !== "agent" || helpers.get("toolDb") !== "tool") {
    failures.push(
      "HELPER-DERIVATION: `schemaHelpers` did not resolve a generic " +
        "`export function xDb<C extends …>(client) { return client.schema(\"x\"); }` — " +
        "every read through the utils/supabase/*Db family would silently key to `?.table` " +
        "and rule 3 would be blind to it while the run stayed green.",
    );
  }
  expectGreen("SELECT-CONSTANT", GREEN_SELECT_CONSTANT);
  expectGreen("AMBIGUOUS-SCHEMA-BLIND", GREEN_AMBIGUOUS_SCHEMA_BLIND);
  expectGreen("ARCHIVE-BLIND-UNSETTLED", GREEN_ARCHIVE_BLIND_UNSETTLED);
  expectGreen("SELECT-STAR", GREEN_SELECT_STAR);
  expectGreen("OTHER-SCHEMA", GREEN_OTHER_SCHEMA);
  expectGreen("CONTROLLED", GREEN_CONTROLLED);
  expectGreen("DISCLOSURE", GREEN_DISCLOSURE, "self-test.tsx");
  expectGreen("SERVICE-LAYER", GREEN_SERVICE_LAYER);
  expectGreen("SINGLE-RECORD", GREEN_SINGLE);
  expectGreen("WRITE", GREEN_WRITE);
  expectGreen("EXEMPT", GREEN_EXEMPT);
  expectGreen("OTHER-TABLE", GREEN_OTHER_TABLE);

  // The entity set must actually come from the generated types.
  const dbTypes = readFileSync(DB_TYPES, "utf8");
  const derivedEntities = archivableEntities(dbTypes);
  if (derivedEntities.get("definition")?.has("tool")) {
    failures.push(
      "DERIVATION: `tool.definition` has no archive column but was derived as " +
        "archivable — the schema keying is broken and every tool read is a false positive.",
    );
  }
  if (!derivedEntities.get("definition")?.has("agent")) {
    failures.push(
      "DERIVATION: `agent.definition` carries `is_archived` but was not derived — " +
        "the schema keying would silently exempt the whole agent catalogue.",
    );
  }
  const derived = archivableTables(dbTypes);
  for (const table of ["template", "canvas_items", "processed_documents"]) {
    if (!derived.has(table)) {
      failures.push(
        `DERIVATION: \`${table}\` carries an archive column in types/database.types.ts ` +
          "but the parser did not find it — the entity set would silently shrink.",
      );
    }
  }
  if (derived.has("admin_audit_log")) {
    failures.push(
      "DERIVATION: a table with no archive column was included — the parser is " +
        "matching Insert/Update blocks or the wrong nesting level.",
    );
  }

  if (failures.length > 0) {
    console.error("\n🚨 check:archived-items-law SELF-TEST FAILED\n");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error(
      "\nFix scripts/check-archived-items-law.ts before trusting a green run.\n",
    );
    process.exit(1);
  }

  console.log(
    `✅ self-test: RED on a hardcoded \`.eq("is_archived", false)\` list read, RED on a\n` +
      "   list that selects the archive column with no control, RED when the only\n" +
      "   'control' is a comment, RED on an archive-blind list read of a settled entity,\n" +
      "   RED on a blind read sitting beside a lawful one in the same file, RED on a\n" +
      "   blind read of a settled entity reached through a schema-binding helper, both\n" +
      "   bound to a name and applied inline;\n" +
      "   GREEN on an option-driven predicate, a blind read of an unsettled entity, a\n" +
      "   `select(\"*\")` hand-off, a named select-constant that carries the archive\n" +
      "   column, a schema-less read of an ambiguous table name, another schema's\n" +
      "   same-named table, a helper-bound read of ANOTHER schema's same-named\n" +
      "   table, a disclosure-backed\n" +
      "   client split, a single-record read, a write, a reasoned exemption, and a table\n" +
      `   with no archive column. Entity set derived from types/database.types.ts (${derived.size} tables).`,
  );
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const entities = archivableEntities(readFileSync(DB_TYPES, "utf8"));
  const files = sourceFiles().map((file) => ({
    file,
    raw: readFileSync(path.join(ROOT, file), "utf8"),
  }));
  // Pass 0 derives the schema-binding helpers, so a read through `docprocDb(…)`
  // resolves to a real entity instead of the ambiguous `?.table` that can
  // neither settle a class nor answer to rule 3 (see `schemaHelpers`).
  const helpers = schemaHelpers(files);
  // Pass 1 derives the settled classes; pass 2 judges every read against them.
  const lawful = lawfulEntitiesIn(files, entities, helpers);
  const findings: Finding[] = [];
  for (const { file, raw } of files) {
    findings.push(...scanFile(file, raw, entities, lawful, helpers));
  }

  if (findings.length === 0) {
    console.log(
      `✅ THE ARCHIVED-ITEMS LAW holds: every list read over the ${entities.size} archivable ` +
        `tables carries an archive control (${lawful.size} entities have a settled ` +
        `class rule 3 protects; ${helpers.size} schema-binding helpers resolved).`,
    );
    return;
  }

  console.error("\n🚨 ARCHIVED-ITEMS LAW VIOLATIONS\n");
  for (const finding of findings) {
    console.error(`  ✗ ${finding.file}:${finding.line} — ${finding.reason}`);
  }
  console.error(
    "\nEvery list over an archivable entity carries an archive control, the default\n" +
      "hides archived rows, and revealing them is one or two clicks — Arman, 2026-09-09\n" +
      "(../common-docs/policies/archived-items.md).\n\n" +
      "Two implementations, no third — BOTH from @ai-matrx/design-system:\n" +
      "  • table/browse  → lib/entity-list `supportsArchived` + <ArchiveFilter>\n" +
      "                    (a real server-side RPC parameter)\n" +
      "  • card lists    → <ArchivedDisclosure> — \"Archived (N)\", closed by\n" +
      "                    default, one click\n" +
      "Import them; never define them here (pnpm check:package-twins).\n\n" +
      "An internal reader that is genuinely not a user-facing list declares it at the\n" +
      "query: `// archived-items-law-exempt: <reason>` (12+ characters of reason).\n",
  );
  process.exit(1);
}

// Importing this file (the self-test harness, ad-hoc census scripts) must not
// run the whole scan — only invoking it does.
if (require.main === module) main();
