#!/usr/bin/env npx tsx
/**
 * AN INVERSE PUTS A DEFECT BACK. IT MAY NOT TAKE THE GROUND OUT FROM UNDER THE PLATFORM.
 *
 * WHAT THIS CLOSES — seven instances, measured, in one session (lane RED-SUITES-3, 2026-09-21,
 * `common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/PROGRESS-RED-SUITES-3.md` §1)
 * ------------------------------------------------------------------------------------------
 * An inverse file is a SNAPSHOT of the world on the day it was written. It carries no
 * `-- based-on:` line for the objects it merely removes, no sweep in either repo reads this
 * directory (every migration glob is non-recursive), and the platform keeps moving underneath
 * it. Four distinct ways that goes wrong, each one found live:
 *
 *  (a) IT DROPS A FUNCTION A LIVE TRIGGER STILL REACHES.
 *      `storerel_a_relation_edge_names_its_field_down.sql` dropped
 *      `custom.record_relation_edges(...)` and the ROW-level trigger
 *      `zz_w2a_relation_association` — which WRITE-PERF-2 had already replaced with the
 *      STATEMENT-level pair `zz_w2a_relation_association_s_i` / `_s_u`, whose bodies CALL that
 *      function. The triggers stayed attached over a function that was gone, so the next insert
 *      into `custom.record` exploded before its red twin asked a single one of its six
 *      questions. Same shape in `w4_io_down.sql`, in `w1_v1_fixes_one_door_predicate_down.sql`
 *      (NINETEEN triggers over `custom.assert_store_door`, the whole record store), and in
 *      `writeperf_the_same_question_is_asked_once_down.sql` (42 triggers over the memo-clear
 *      family). Destructive in all four.
 *
 *  (b) IT CALLS A FUNCTION A SIBLING INVERSE DROPS.
 *      LADDER-CAP's `..._steps_aside_for_every_specific_rung_down.sql` drops
 *      `custom.addressed_cap_specific`, and the body its sibling
 *      `..._cap_governs_the_whole_ladder_down.sql` restores CALLS it. Run both and the access
 *      kernel calls a function that no longer exists.
 *
 *  (c) IT RESTORES A DEFECT INTO A BODY NO TRIGGER RUNS.
 *      `checklists_a_checklist_is_a_template_of_work_down.sql` took away
 *      `custom._checklist_watch()`, which no trigger has called since the statement-level pair
 *      replaced it. Not destructive — INERT, which is worse for a guard: the red twin passed
 *      with the defect never put back (this is `checklists_red` RED 4).
 *
 *  (d) IT DEMOLISHES INFRASTRUCTURE A LATER MIGRATION ADOPTED.
 *      `writeperf_..._down.sql` dropped the whole `platform.memo_*` store, which
 *      `custom.assert_store_door` — the ONE body every write door in the record store reaches —
 *      now reads. `mergehist_..._down.sql` DROPPED `history.row_versions.migration_id`, which
 *      the statement-level capture names in its own INSERT. `levelfix_..._down.sql` dropped
 *      `iam.grant_addressed_level` and `iam.member_lane_confers`, both called by the access
 *      kernel. Restoring a defect is not the same as breaking the platform.
 *
 * THE RULE, in one sentence: after an inverse runs, every trigger still attached must reach
 * only functions that still exist, no inverse may call what a sibling inverse takes away, a
 * body an inverse restores must be one something actually runs, and an object a LATER migration
 * adopted is not this inverse's to remove.
 *
 * HOW IT IS CHECKED
 * -----------------
 * STATIC (default, no database — this is the release-gate arm). The whole applied tree
 * (`migrations/*.sql` + `migrations/campaign/*.sql`) is parsed into a trigger table and a
 * function call graph; every inverse is then simulated against it. Clause (a) is TRANSITIVE:
 * a trigger that calls a body that calls the dropped function is just as broken as one that
 * executes it directly, and four of the seven instances are only visible that way.
 *
 * LIVE (`--live`, the rehearsal branch or the main database). The same four clauses against the
 * real catalogue: `pg_trigger` joined to `pg_proc` for what is ACTUALLY attached today, and
 * `public._schema_migrations.applied_at` for the ledger's own order, which is the only honest
 * answer to "did a LATER migration adopt this". Read-only: it runs no DDL and opens no
 * transaction that outlives the query.
 *
 *   pnpm check:inverses-leave-the-ground-standing
 *   pnpm check:inverses-leave-the-ground-standing:self-test   # proves it can still go red
 *   pnpm check:inverses-leave-the-ground-standing:live        # against the catalogue + ledger
 *
 * THE SELF-TEST IS NOT A MOCK. It re-reads the SEVEN RECORDED INSTANCES' OWN PRE-FIX BYTES out
 * of git (the commit before each was repaired) and requires the guard to name every one of
 * them; then it requires today's bytes to be clean. A guard that cannot be shown failing on
 * the defect it was written for is not a guard.
 *
 * KNOWN LIMITS, stated rather than hidden. The static arm resolves functions by
 * `schema.name` and ignores overloads (an inverse that drops ONE overload of a name another
 * body calls is reported as if it dropped the name — conservative in the right direction, and
 * the live arm resolves the real signature). It sees schema-qualified calls only, which is what
 * this repository writes everywhere. And a trigger whose creating file the tree no longer
 * carries is invisible to the static arm — that is exactly what `--live` is for.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");
const INVERSE_DIR = resolve(MIGRATIONS, "inverse");
const CAMPAIGN_DIR = resolve(MIGRATIONS, "campaign");

/* ------------------------------------------------------------------ parsing */

/** Comments out, so a sentence ABOUT a call is never read as a call. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const ID = "[a-z_][a-z0-9_$]*";
const QUALIFIED = `"?${ID}"?\\s*\\.\\s*"?${ID}"?`;

function unquote(name: string): string {
  return name.replace(/["\s]/g, "").toLowerCase();
}

export interface TriggerRef {
  readonly name: string;
  readonly table: string;
  readonly fn: string;
  readonly file: string;
}

export interface FileFacts {
  readonly file: string;
  /** `schema.name` of every function this file DROPs (overloads collapsed). */
  readonly dropsFunctions: Set<string>;
  /** `table::trigger` of every trigger this file DROPs. */
  readonly dropsTriggers: Set<string>;
  /** `schema.table` of every table this file DROPs. */
  readonly dropsTables: Set<string>;
  /** `schema.table.column` of every column this file DROPs. */
  readonly dropsColumns: Set<string>;
  /** Triggers this file CREATEs. */
  readonly createsTriggers: TriggerRef[];
  /** `schema.name` -> does it return trigger, what its body calls, and what it merely names. */
  readonly createsFunctions: Map<string, {
    returnsTrigger: boolean;
    calls: Set<string>;
    touches: Set<string>;
    /** The body's own text, which clause (d) needs to see a BARE column name. */
    text: string;
  }>;
  /** Every `schema.name` token that appears anywhere outside a comment. */
  readonly mentions: Set<string>;
}

export function parseSql(file: string, raw: string): FileFacts {
  const sql = stripComments(raw);

  const dropsFunctions = new Set<string>();
  for (const m of sql.matchAll(new RegExp(`drop\\s+function\\s+(?:if\\s+exists\\s+)?(${QUALIFIED})`, "gi"))) {
    dropsFunctions.add(unquote(m[1]!));
  }

  const dropsTriggers = new Set<string>();
  for (const m of sql.matchAll(
    new RegExp(`drop\\s+trigger\\s+(?:if\\s+exists\\s+)?("?${ID}"?)\\s+on\\s+(${QUALIFIED})`, "gi"),
  )) {
    dropsTriggers.add(`${unquote(m[2]!)}::${unquote(m[1]!)}`);
  }

  const dropsTables = new Set<string>();
  for (const m of sql.matchAll(
    new RegExp(`drop\\s+(?:foreign\\s+)?table\\s+(?:if\\s+exists\\s+)?(${QUALIFIED})`, "gi"),
  )) {
    dropsTables.add(unquote(m[1]!));
  }

  const dropsColumns = new Set<string>();
  for (const m of sql.matchAll(
    new RegExp(
      `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${QUALIFIED})([\\s\\S]{0,400}?);`,
      "gi",
    ),
  )) {
    const table = unquote(m[1]!);
    for (const c of m[2]!.matchAll(new RegExp(`drop\\s+column\\s+(?:if\\s+exists\\s+)?("?${ID}"?)`, "gi"))) {
      dropsColumns.add(`${table}.${unquote(c[1]!)}`);
    }
  }

  const createsTriggers: TriggerRef[] = [];
  for (const m of sql.matchAll(
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\s+("?${ID}"?)([\\s\\S]{0,800}?)` +
        `\\bon\\s+(${QUALIFIED})([\\s\\S]{0,800}?)execute\\s+(?:function|procedure)\\s+(${QUALIFIED})\\s*\\(`,
      "gi",
    ),
  )) {
    createsTriggers.push({
      name: unquote(m[1]!),
      table: unquote(m[3]!),
      fn: unquote(m[5]!),
      file,
    });
  }

  // Function bodies. The header, then the dollar-quoted body that follows it.
  const createsFunctions = new Map<string, {
    returnsTrigger: boolean;
    calls: Set<string>;
    touches: Set<string>;
    text: string;
  }>();
  const headerRe = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(${QUALIFIED})\\s*\\(`,
    "gi",
  );
  for (const m of sql.matchAll(headerRe)) {
    const name = unquote(m[1]!);
    const after = sql.slice(m.index! + m[0].length, m.index! + m[0].length + 200000);
    const bodyM = after.match(/\$([a-z0-9_]*)\$([\s\S]*?)\$\1\$/i);
    const head = bodyM ? after.slice(0, bodyM.index!) : after.slice(0, 600);
    const body = bodyM ? bodyM[2]! : "";
    const returnsTrigger = /returns\s+trigger\b/i.test(head);
    // A CALL is an invocation: `schema.name(`. A TOUCH is any other mention — the tables and
    // columns a body reads or writes, which clause (d) needs and clause (a) must not confuse
    // with a call.
    const calls = new Set<string>();
    for (const c of body.matchAll(new RegExp(`(${QUALIFIED})\\s*\\(`, "gi"))) {
      const q = unquote(c[1]!);
      if (q !== name) calls.add(q);
    }
    const touches = new Set<string>();
    for (const c of body.matchAll(new RegExp(`(${QUALIFIED})(\\s*\\.\\s*"?${ID}"?)?`, "gi"))) {
      const q = unquote(c[0]!);
      if (q !== name && !calls.has(q)) touches.add(q);
    }
    const prior = createsFunctions.get(name);
    if (prior) {
      for (const c of calls) prior.calls.add(c);
      for (const t of touches) prior.touches.add(t);
    } else {
      createsFunctions.set(name, { returnsTrigger, calls, touches, text: body });
    }
  }

  const mentions = new Set<string>();
  for (const m of sql.matchAll(new RegExp(`(${QUALIFIED})`, "gi"))) mentions.add(unquote(m[1]!));

  return {
    file,
    dropsFunctions,
    dropsTriggers,
    dropsTables,
    dropsColumns,
    createsTriggers,
    createsFunctions,
    mentions,
  };
}

/* ------------------------------------------------------------- the applied tree */

function sqlFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => resolve(dir, f));
}

/**
 * The bodies that are ON THE LIVE PATH even though no trigger names them directly: the access
 * kernel and the store's own front doors. Every one of them is reached by a person's ordinary
 * read or write, and the three recorded (d) instances are all things one of them calls.
 */
const KERNEL_ROOTS = [
  "custom.assert_store_door",
  "custom.assert_client_may_reach",
  "custom.addressed_cap",
  "custom.addressed_cap_specific",
  "custom.reaches_directly",
  "custom.my_level",
  "custom.visible_set",
  "iam.effective_level",
  "platform.knob_resolve",
];

/** How far a trigger body is followed. Two hops covers every recorded instance and keeps the
 * answer about THIS trigger rather than about the whole database — a union call graph over
 * 3,000 bodies reaches almost everything if you let it. */
const TRIGGER_DEPTH = 2;
/** The live path is followed one hop further: a kernel root, what it calls, what that calls. */
const KERNEL_DEPTH = 3;

export interface Tree {
  readonly files: FileFacts[];
  /** `schema.name` -> the functions that body invokes. */
  readonly calls: Map<string, Set<string>>;
  /** `schema.name` -> the tables/columns that body names without calling. */
  readonly touches: Map<string, Set<string>>;
  readonly returnsTrigger: Set<string>;
  /** `table::trigger` -> the function it executes, for triggers the tree leaves standing. */
  readonly liveTriggers: Map<string, TriggerRef>;
  /** object -> the applied files whose bodies depend on it, with the body's own name. */
  readonly dependents: Map<string, Set<string>>;
  /** object -> every body that depends on it, with the file that defines that body. */
  readonly dependentsBody: Map<string, Array<{ body: string; file: string }>>;
  /** Everything reachable from a kernel root or a live trigger: the live path. */
  readonly livePath: Set<string>;
  /** `schema.name` -> the file it is defined in and its body text. A column an inverse drops is
   * named BARE inside an INSERT's column list, so nothing qualified can see it — this can. */
  readonly bodies: Map<string, { file: string; text: string }>;
}

export function buildTree(files: string[]): Tree {
  return buildTreeFromFacts(files.map((f) => parseSql(f, readFileSync(f, "utf8"))));
}

/** The same tree from facts that did not come off disk — the live catalogue's, for `--live`. */
export function buildTreeFromFacts(facts: FileFacts[]): Tree {

  const calls = new Map<string, Set<string>>();
  const touches = new Map<string, Set<string>>();
  const returnsTrigger = new Set<string>();
  const created = new Map<string, TriggerRef>();
  const retired = new Set<string>();
  const dependents = new Map<string, Set<string>>();
  const dependentsBody = new Map<string, Array<{ body: string; file: string }>>();
  const bodies = new Map<string, { file: string; text: string }>();

  const note = (obj: string, file: string, body: string): void => {
    if (!dependents.has(obj)) dependents.set(obj, new Set());
    dependents.get(obj)!.add(file);
    if (!dependentsBody.has(obj)) dependentsBody.set(obj, []);
    dependentsBody.get(obj)!.push({ body, file });
  };

  for (const f of facts) {
    for (const [name, def] of f.createsFunctions) {
      if (!calls.has(name)) calls.set(name, new Set());
      if (!touches.has(name)) touches.set(name, new Set());
      if (def.text) bodies.set(name, { file: f.file, text: def.text });
      for (const c of def.calls) {
        calls.get(name)!.add(c);
        note(c, f.file, name);
      }
      for (const t of def.touches) {
        touches.get(name)!.add(t);
        note(t, f.file, name);
      }
      if (def.returnsTrigger) returnsTrigger.add(name);
    }
    for (const t of f.createsTriggers) {
      created.set(`${t.table}::${t.name}`, t);
      note(t.fn, f.file, `trigger ${t.name}`);
    }
    for (const key of f.dropsTriggers) {
      if (!f.createsTriggers.some((t) => `${t.table}::${t.name}` === key)) retired.add(key);
    }
  }

  // A trigger name the tree takes off and puts back nowhere else is NOT standing. The static
  // arm cannot order two files, so it reads a removal it cannot see re-created as final —
  // conservative in the direction that matters (fewer false accusations).
  const liveTriggers = new Map<string, TriggerRef>();
  for (const [key, t] of created) {
    const recreatedElsewhere = facts.some(
      (f) => f.createsTriggers.some((x) => `${x.table}::${x.name}` === key) && !f.dropsTriggers.has(key),
    );
    if (retired.has(key) && !recreatedElsewhere) continue;
    liveTriggers.set(key, t);
  }

  // The live path: what a trigger runs, and what the access kernel runs.
  const livePath = new Set<string>();
  const walk = (root: string, depth: number): void => {
    let frontier = new Set<string>([root]);
    livePath.add(root);
    for (let i = 0; i < depth; i++) {
      const next = new Set<string>();
      for (const cur of frontier) {
        for (const c of calls.get(cur) ?? []) if (!livePath.has(c)) { livePath.add(c); next.add(c); }
        for (const t of touches.get(cur) ?? []) livePath.add(t);
      }
      frontier = next;
    }
  };
  for (const t of liveTriggers.values()) walk(t.fn, KERNEL_DEPTH);
  for (const r of KERNEL_ROOTS) walk(r, KERNEL_DEPTH);

  return { files: facts, calls, touches, returnsTrigger, liveTriggers, dependents, dependentsBody, livePath, bodies };
}

/**
 * What a trigger body reaches within `depth` hops — calls AND the tables it names — in a world
 * where `calls`/`touches` are the bodies that exist AFTER the inverse under judgement has run.
 * Judging against the tree's own graph instead would blame a file for reaching through a body
 * it replaces: `writeperf_..._down.sql` restores `platform.knob_resolve`'s PRE-MEMO body, which
 * calls nothing it then drops.
 */
export function reachFrom(
  root: string,
  calls: Map<string, Set<string>>,
  touches: Map<string, Set<string>>,
  depth: number,
): Set<string> {
  const seen = new Set<string>([root]);
  let frontier = new Set<string>([root]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const cur of frontier) {
      for (const c of calls.get(cur) ?? []) if (!seen.has(c)) { seen.add(c); next.add(c); }
      for (const t of touches.get(cur) ?? []) seen.add(t);
    }
    frontier = next;
  }
  return seen;
}

/* --------------------------------------------------------------- the clauses */

export interface Finding {
  readonly clause: "a" | "b" | "c" | "d";
  readonly file: string;
  readonly what: string;
}

/** `laddercap_the_cap_governs_..._down.sql` -> `laddercap`. */
function family(basename: string): string {
  const stem = basename.replace(/\.sql$/, "").replace(/(_down|\.inverse)$/, "");
  return stem.split("_")[0]!.toLowerCase();
}

/** The campaign file this inverse inverts, if the tree carries it. */
function upFileOf(basename: string): string | null {
  const stem = basename.replace(/\.sql$/, "").replace(/(_down|\.inverse)$/, "");
  const candidates = [resolve(CAMPAIGN_DIR, `${stem}.sql`), resolve(MIGRATIONS, `${stem}.sql`)];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * An inverse may say IN ITS OWN BYTES that it has looked at a clause and handled it — the
 * `storerel` fix is the worked example: it drops the row-level names AND the statement-level
 * pair, and says why. The acknowledgement is a sentence in the file, never a list in this
 * guard: an excuse list kept somewhere else is how a ratchet dies.
 */
const ACKNOWLEDGED = /ground-standing-ok:\s*([a-d](?:\s*,\s*[a-d])*)/i;

function acknowledgedClauses(raw: string): Set<string> {
  const out = new Set<string>();
  for (const m of raw.matchAll(new RegExp(ACKNOWLEDGED, "gi"))) {
    for (const c of m[1]!.split(",")) out.add(c.trim().toLowerCase());
  }
  return out;
}

/** The four clauses over ONE inverse's bytes. */
export function judgeFile(
  base: string,
  facts: FileFacts,
  raw: string,
  tree: Tree,
  siblingDrops: Map<string, string>,
): Finding[] {
  const out: Finding[] = [];
  const ack = acknowledgedClauses(raw);
  const fam = family(base);
  const up = upFileOf(base);

  // What this file takes away and does not put back in the same bytes.
  const gone = new Set<string>();
  for (const fn of facts.dropsFunctions) if (!facts.createsFunctions.has(fn)) gone.add(fn);
  for (const t of facts.dropsTables) gone.add(t);
  for (const c of facts.dropsColumns) gone.add(c);

  // THE WORLD AFTER THIS FILE RUNS: the tree's bodies, with the ones this inverse restores
  // swapped in and the ones it takes away removed. Every clause is judged against that world.
  const afterCalls = new Map(tree.calls);
  const afterTouches = new Map(tree.touches);
  for (const [name, def] of facts.createsFunctions) {
    afterCalls.set(name, def.calls);
    afterTouches.set(name, def.touches);
  }
  for (const g of gone) {
    afterCalls.delete(g);
    afterTouches.delete(g);
  }
  /** A dependency this same file also removes is not a dependency. */
  const alsoRemovedHere = (dependent: string): boolean => {
    const trig = dependent.match(/^trigger (\S+)$/);
    if (trig) return [...facts.dropsTriggers].some((k) => k.endsWith(`::${trig[1]}`));
    return gone.has(dependent) || facts.createsFunctions.has(dependent);
  };

  /* (a) a trigger it leaves attached reaches something it took away. */
  const blamedByA = new Set<string>();
  if (gone.size && !ack.has("a")) {
    const hits: string[] = [];
    for (const [key, trig] of tree.liveTriggers) {
      if (facts.dropsTriggers.has(key)) continue;
      if (!afterCalls.has(trig.fn) && !tree.calls.has(trig.fn)) continue; // its body went with it
      if (gone.has(trig.fn)) continue; // the trigger's own body is gone: (c)'s business, not (a)'s
      const reached = reachFrom(trig.fn, afterCalls, afterTouches, TRIGGER_DEPTH);
      const broken = [...gone].filter((g) => reached.has(g));
      if (!broken.length) continue;
      for (const b of broken) blamedByA.add(b);
      hits.push(`${trig.name} on ${trig.table} (runs ${trig.fn}) over ${broken.slice(0, 3).join(", ")}`);
      if (hits.length >= 3) break;
    }
    if (hits.length) {
      out.push({
        clause: "a",
        file: base,
        what:
          `leaves a live trigger attached over a body it takes away — ${hits.join("; ")}. ` +
          `Detach the trigger BEFORE the function, or stop dropping the function. A dropped ` +
          `function under an attached trigger is not a defect put back, it is a broken table.`,
      });
    }
  }

  /* (b) it restores a body that calls what a sibling inverse drops. */
  if (!ack.has("b")) {
    const callsHere = new Set<string>();
    for (const def of facts.createsFunctions.values()) for (const c of def.calls) callsHere.add(c);
    const clash = [...callsHere].filter(
      (c) =>
        siblingDrops.has(c) &&
        siblingDrops.get(c) !== base &&
        !facts.createsFunctions.has(c) &&
        !facts.dropsFunctions.has(c) &&
        tree.livePath.has(c),
    );
    if (clash.length) {
      out.push({
        clause: "b",
        file: base,
        what:
          `restores a body that calls ${clash.slice(0, 3).join(", ")} — on the live path — which ` +
          `its sibling inverse ${siblingDrops.get(clash[0]!)} drops. Run both and the kernel calls ` +
          `a function that is gone. Say in the file which one is meant to run, or restore the callee.`,
      });
    }
  }

  /* (c) it touches a trigger body that no trigger runs: inert, and the twin beside it lies. */
  if (!ack.has("c")) {
    const inert: string[] = [];
    const touched = new Set<string>([...facts.dropsFunctions, ...facts.createsFunctions.keys()]);
    for (const name of touched) {
      const isTriggerBody =
        tree.returnsTrigger.has(name) || facts.createsFunctions.get(name)?.returnsTrigger === true;
      if (!isTriggerBody) continue;
      const runBy = [...tree.liveTriggers.values()].some((t) => t.fn === name);
      const runHere = facts.createsTriggers.some((t) => t.fn === name);
      if (!runBy && !runHere) inert.push(name);
    }
    if (inert.length) {
      out.push({
        clause: "c",
        file: base,
        what:
          `drops or restores trigger body ${inert.slice(0, 3).join(", ")}, which NO trigger runs. ` +
          `The defect is never put back and the red twin beside it proves nothing. Point the file ` +
          `at the body the live trigger actually calls.`,
      });
    }
  }

  /* (d) it demolishes something on the live path that a body outside its lane depends on. */
  if (gone.size && !ack.has("d")) {
    const adopted: string[] = [];
    for (const g of gone) {
      if (blamedByA.has(g)) continue; // already named under (a), same remedy
      const parts = g.split(".");
      if (parts.length === 3) {
        // A COLUMN. Nothing qualified names it — an INSERT's column list writes it bare — so the
        // dependent is a body on the live path that writes this TABLE and says this WORD. That is
        // exactly how `history.row_versions.migration_id` hid from every sweep in the repository.
        const table = `${parts[0]}.${parts[1]}`;
        const column = parts[2]!;
        if (!tree.livePath.has(table)) continue;
        const word = new RegExp(`\\b${column}\\b`);
        let named: { fn: string; file: string } | null = null;
        for (const [fn, body] of tree.bodies) {
          if (!tree.livePath.has(fn)) continue;
          if (alsoRemovedHere(fn)) continue;
          if (family(body.file.split("/").pop()!) === fam) continue;
          if (up && body.file === up) continue;
          if (!body.text.includes(table) || !word.test(body.text)) continue;
          named = { fn, file: body.file };
          break;
        }
        if (named) adopted.push(`${g} (${named.fn} in ${named.file.split("/").pop()})`);
        continue;
      }
      if (!tree.livePath.has(g)) continue; // an ordinary lane object, inverted in lane order
      const by = tree.dependents.get(g);
      if (!by) continue;
      const outside = [...by].filter((f) => (up && f === up ? false : family(f.split("/").pop()!) !== fam));
      if (!outside.length) continue;
      // The dependent bodies, minus the ones this same file removes: a file that detaches the
      // trigger and drops the pair of bodies under it has taken the whole thing away cleanly.
      const standing = (tree.dependentsBody.get(g) ?? []).filter((d) => !alsoRemovedHere(d.body) && !alsoRemovedHere(d.file));
      const pick = standing.find((d) => outside.includes(d.file));
      if (!pick) continue;
      adopted.push(`${g} (${pick.body} in ${pick.file.split("/").pop()})`);
    }
    if (adopted.length) {
      out.push({
        clause: "d",
        file: base,
        what:
          `drops ${adopted.slice(0, 3).join("; ")}${adopted.length > 3 ? ` +${adopted.length - 3} more` : ""} — ` +
          `on the live path, adopted by a body outside this lane. Restoring a defect is not the ` +
          `same as breaking the platform: leave the object standing and neuter the behaviour.`,
      });
    }
  }

  return out;
}

export function judge(
  inverseFiles: string[],
  tree: Tree,
): { findings: Finding[]; census: Record<string, number> } {
  const parsed = new Map<string, FileFacts>();
  const rawOf = new Map<string, string>();
  for (const f of inverseFiles) {
    const raw = readFileSync(f, "utf8");
    rawOf.set(f, raw);
    parsed.set(f, parseSql(f, raw));
  }

  // The family graph, built from the filename stems: which sibling drops what.
  const byFamily = new Map<string, Map<string, string>>();
  for (const [file, facts] of parsed) {
    const base = file.split("/").pop()!;
    const fam = family(base);
    if (!byFamily.has(fam)) byFamily.set(fam, new Map());
    const bag = byFamily.get(fam)!;
    for (const fn of facts.dropsFunctions) if (!bag.has(fn)) bag.set(fn, base);
  }

  const findings: Finding[] = [];
  const census = { inverses: inverseFiles.length, dropsFunctions: 0, dropsTriggers: 0, restores: 0 };
  for (const [file, facts] of parsed) {
    const base = file.split("/").pop()!;
    census.dropsFunctions += facts.dropsFunctions.size;
    census.dropsTriggers += facts.dropsTriggers.size;
    census.restores += facts.createsFunctions.size;
    findings.push(...judgeFile(base, facts, rawOf.get(file)!, tree, byFamily.get(family(base)) ?? new Map()));
  }
  return { findings, census };
}


/* ------------------------------------------------------------------ the live arm */

/**
 * CLAUSES (a) AND (c) AGAINST THE REAL CATALOGUE. The static arm reads what the tree SAYS is
 * attached; this reads what IS attached — which is the difference that hid `storerel`'s defect
 * for a whole session, because the trigger that broke it was created by a file nobody was
 * reading. Read-only: two SELECTs, no DDL, no transaction that outlives them.
 *
 * Clauses (b) and (d) stay static-only and say so: they are about which LANE a body belongs to,
 * and the catalogue does not record that — `pg_proc` has no filename.
 */
async function liveArm(inverses: string[]): Promise<number> {
  const { loadDbEnv, connectDirect } = await import("./lib/direct-db");
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[FAIL] the live arm is UNMEASURED - missing ${env.missing.join(", ")}. Looked in: ` +
        `${env.looked.join(", ")}. An unmeasured check is never a pass.`,
    );
    return 1;
  }
  console.log(`[INFO] live arm on ${env.host}/${env.database} (connection from ${env.from}).`);
  const db = await connectDirect(env, "check:inverses-leave-the-ground-standing");
  try {
    const trig = await db.query<{ trig: string; tbl: string; fn: string }>(
      `select t.tgname as trig,
              n.nspname || '.' || c.relname as tbl,
              pn.nspname || '.' || p.proname as fn
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
         join pg_namespace pn on pn.oid = p.pronamespace
        where not t.tgisinternal
          and n.nspname not in ('pg_catalog','information_schema')`,
    );
    const defs = await db.query<{ name: string; def: string; rettrig: boolean }>(
      `select pn.nspname || '.' || p.proname as name,
              pg_get_functiondef(p.oid) as def,
              p.prorettype = 'trigger'::regtype as rettrig
         from pg_proc p
         join pg_namespace pn on pn.oid = p.pronamespace
        where p.prokind = 'f'
          and pn.nspname not in ('pg_catalog','information_schema','extensions','graphql','pgbouncer')`,
    );
    const ledger = await db.query<{ n: string }>(
      `select count(*)::text as n from public._schema_migrations`,
    );
    console.log(
      `[INFO] catalogue: ${trig.rows.length} standing trigger(s), ${defs.rows.length} function ` +
        `body(s), ${ledger.rows[0]?.n ?? "?"} ledgered migration(s).`,
    );
    if (trig.rows.length < 50 || defs.rows.length < 200) {
      console.error(`[FAIL] the catalogue answered too little to judge anything. Refusing to pass.`);
      return 1;
    }

    // One synthetic "file" per live body, and one carrying every standing trigger.
    const facts: FileFacts[] = defs.rows.map((r) => parseSql("live:" + r.name, r.def));
    const triggerFacts = parseSql(
      "live:triggers",
      trig.rows
        .map((r) => `create trigger ${r.trig} after insert on ${r.tbl} execute function ${r.fn}();`)
        .join("\n"),
    );
    const tree = buildTreeFromFacts([...facts, triggerFacts]);

    let red = 0;
    for (const f of inverses) {
      const raw = readFileSync(f, "utf8");
      const base = f.split("/").pop()!;
      const found = judgeFile(base, parseSql(f, raw), raw, tree, new Map()).filter(
        (x) => x.clause === "a" || x.clause === "c",
      );
      for (const x of found) {
        red++;
        console.error(`       LIVE (${x.clause}) ${x.file} — ${x.what}`);
      }
    }
    if (red > LIVE_BASELINE) {
      console.error(
        `[FAIL] ${red} live finding(s) on clauses (a)/(c), baseline ${LIVE_BASELINE}. The catalogue ` +
          `is the referee: these triggers are attached RIGHT NOW over bodies those inverses remove.`,
      );
      return 1;
    }
    console.log(
      `[ OK ] live clauses (a) and (c) - ${red} finding(s), baseline ${LIVE_BASELINE}. Clauses (b) ` +
        `and (d) are static-only: pg_proc records no filename, so it cannot say which lane a body ` +
        `belongs to.`,
    );
    return 0;
  } finally {
    await db.end();
  }
}

/* ----------------------------------------------------------------------- main */

/**
 * THE RATCHET, AND IT IS AT ZERO. 103 findings stood on the day this guard was written
 * (2026-09-21) — the class had been growing unwatched for the whole campaign. They were all
 * CLOSED the same day across 90 files, so the baseline is ZERO on all four clauses: ANY finding
 * is a new one, and an inverse written with one of these defects is refused on the day it is
 * written. Every finding is NAMED on every run rather than hidden behind a number, and there is
 * no excuse list — a file that has genuinely handled a clause says so in its own bytes,
 * `-- ground-standing-ok: <clauses>`, with the sentence that explains why beside it.
 *
 * 🚨 These may only ever go DOWN. Raising one to make a release pass re-admits the whole class
 * silently, which is the state this guard exists to end.
 */
const BASELINE: Record<"a" | "b" | "c" | "d", number> = { a: 0, b: 0, c: 0, d: 0 };

/**
 * The same ratchet for `--live`, which judges clauses (a) and (c) against the REAL catalogue —
 * 6,752 standing triggers and 4,157 live bodies on the main database, read-only. 37 on the first
 * live run (2026-09-21), against 34 from the static arm on the same clauses: the catalogue sees
 * triggers no file in the tree creates any more, which is the whole reason this arm exists. It
 * may only go down.
 */
const LIVE_BASELINE = 37;

/** The seven recorded instances and the commit that repaired each: the guard's own red proof. */
const RECORDED: Array<{ file: string; fixedIn: string }> = [
  { file: "storerel_a_relation_edge_names_its_field_down.sql", fixedIn: "39bd1b6260" },
  { file: "w4_io_down.sql", fixedIn: "39bd1b6260" },
  { file: "checklists_a_checklist_is_a_template_of_work_down.sql", fixedIn: "39bd1b6260" },
  { file: "w1_v1_fixes_one_door_predicate_down.sql", fixedIn: "d0e14933af" },
  { file: "writeperf_the_same_question_is_asked_once_down.sql", fixedIn: "33b3261b2b" },
  { file: "mergehist_a_compound_operation_signs_its_revision_down.sql", fixedIn: "5c6034d8f2" },
  { file: "levelfix_membership_confers_the_organizations_level_down.sql", fixedIn: "8661baff3b" },
];

function prefixBytes(file: string, fixedIn: string): string | null {
  try {
    return execFileSync("git", ["show", `${fixedIn}^:migrations/inverse/${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function main(): void {
  const selfTest = process.argv.includes("--self-test");
  const live = process.argv.includes("--live");

  const applied = [...sqlFilesIn(MIGRATIONS), ...sqlFilesIn(CAMPAIGN_DIR)];
  if (applied.length < 100) {
    console.error(
      `[FAIL] only ${applied.length} applied migration(s) found under ${MIGRATIONS}. Either the ` +
        `tree moved or this guard is reading the wrong place — and then its green answer means nothing.`,
    );
    exitAfterDrain(1);
  }
  const inverses = sqlFilesIn(INVERSE_DIR);
  if (inverses.length < 50) {
    console.error(`[FAIL] only ${inverses.length} inverse file(s) under ${INVERSE_DIR}. Refusing to pass.`);
    exitAfterDrain(1);
  }

  const tree = buildTree(applied);
  const { findings, census } = judge(inverses, tree);

  console.log(
    `[INFO] ${census.inverses} inverse file(s); they drop ${census.dropsFunctions} function name(s) ` +
      `and ${census.dropsTriggers} trigger(s), and restore ${census.restores} body(s). The applied ` +
      `tree carries ${applied.length} file(s), ${tree.liveTriggers.size} standing trigger(s) and ` +
      `${tree.calls.size} function body(s).`,
  );

  if (selfTest) {
    // THE RED HALF — the seven recorded instances' own pre-fix bytes, out of git.
    const named: string[] = [];
    const unavailable: string[] = [];
    for (const rec of RECORDED) {
      const bytes = prefixBytes(rec.file, rec.fixedIn);
      if (bytes === null) {
        unavailable.push(rec.file);
        continue;
      }
      const facts = parseSql(resolve(INVERSE_DIR, rec.file), bytes);
      // Judge this one file alone, with its PRE-FIX bytes standing in for today's, against the
      // same family graph the real run uses.
      const siblings = new Map<string, string>();
      for (const s2 of inverses) {
        const b2 = s2.split("/").pop()!;
        if (b2 === rec.file || family(b2) !== family(rec.file)) continue;
        for (const fn of parseSql(s2, readFileSync(s2, "utf8")).dropsFunctions) {
          if (!siblings.has(fn)) siblings.set(fn, b2);
        }
      }
      const one = judgeFile(rec.file, facts, bytes, tree, siblings);
      if (one.length) named.push(`${rec.file} [${[...new Set(one.map((x) => x.clause))].sort().join("")}]`);
      else console.error(`[FAIL] SELF-TEST: the pre-fix bytes of ${rec.file} are NOT named by this guard.`);
    }
    if (unavailable.length) {
      console.error(
        `[FAIL] SELF-TEST could not read the pre-fix bytes of ${unavailable.join(", ")} — the ` +
          `guard's red proof cannot be shown, so it is not proven. Check the commits in RECORDED.`,
      );
      exitAfterDrain(1);
    }
    if (named.length !== RECORDED.length) {
      console.error(
        `[FAIL] SELF-TEST FAILED - ${named.length} of ${RECORDED.length} recorded instances were ` +
          `named on their own pre-fix bytes. A guard that cannot be shown failing is not a guard.`,
      );
      exitAfterDrain(1);
    }
    console.log(
      `[ OK ] self-test - all ${RECORDED.length} recorded instances go RED on their own pre-fix ` +
        `bytes: ${named.join(" · ")}`,
    );
  }

  if (live) {
    liveArm(inverses)
      .then((code) => exitAfterDrain(code))
      .catch((e: Error) => {
        console.error(`[FAIL] the live arm could not read the catalogue: ${e.message}`);
        exitAfterDrain(1);
      });
    return;
  }

  const byClause: Record<"a" | "b" | "c" | "d", number> = { a: 0, b: 0, c: 0, d: 0 };
  for (const f of findings) byClause[f.clause]++;

  // Every finding is NAMED on every run, whether or not it fails the build. A number nobody can
  // act on is how a ratchet turns into wallpaper.
  for (const f of findings) console.error(`       (${f.clause}) ${f.file} — ${f.what}`);

  const over = (["a", "b", "c", "d"] as const).filter((c) => byClause[c] > BASELINE[c]);
  const under = (["a", "b", "c", "d"] as const).filter((c) => byClause[c] < BASELINE[c]);
  const tally = (["a", "b", "c", "d"] as const).map((c) => `${c}=${byClause[c]}/${BASELINE[c]}`).join(" ");

  if (over.length) {
    console.error(
      `[FAIL] an inverse was written (or changed) into one of the four defects this guard exists ` +
        `for: ${tally} — clause(s) ${over.join(", ")} are ABOVE their baseline. (a) detach the ` +
        `trigger before you drop the body it runs; (b) restore the callee or say in the file which ` +
        `sibling is meant to run; (c) point the file at the body a live trigger actually calls; ` +
        `(d) leave the object standing and neuter the behaviour instead. A file that has looked at ` +
        `a clause and handled it says so in its own bytes: \`-- ground-standing-ok: <clauses>\`.`,
    );
    exitAfterDrain(1);
  }

  if (under.length) {
    console.log(
      `[ OK ] inverses leaving the ground standing - ${tally}. LOWER THE BASELINE in this file for ` +
        `clause(s) ${under.join(", ")} so the ones you fixed cannot come back.`,
    );
    exitAfterDrain(0);
  }

  console.log(
    `[ OK ] inverses leaving the ground standing - ${tally}, exactly the baseline over ` +
      `${census.inverses} file(s). No new one was added.`,
  );
  exitAfterDrain(0);
}

main();
