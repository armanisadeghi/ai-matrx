/**
 * The CLASSIFIER behind `pnpm db:objects-diff --against branch` — which object
 * delta between production and the rehearsal branch is A RULING the chair must
 * make, and which is PRE-RULED NOISE nobody's lane may spend a minute on.
 *
 * WHY THIS EXISTS
 * ---------------
 * The v5 build book's `W0-TGT-FE` entry check used to be satisfied by counting
 * three schemas on the rehearsal branch. "Three schemas exist" cannot see that
 * the branch is already structurally BEHIND the production it stands in for:
 * measured 2026-09-16, `platform` held 90 base tables on production against 88
 * on the branch, production carrying `masterwork_run_kind` and
 * `provision_generate_target` the branch never got. The branch is a schema-only
 * transplant, both repos take ~400 commits a day, and a file whose rehearsal
 * passed on the branch is applied 59 hours later to a production that moved
 * underneath it. So the entry prints the OBJECT-LEVEL diff, in both directions,
 * by name — and this module is the half that decides what the printout means.
 *
 * WHY A CLASSIFIER AND NOT JUST A DIFF (ATTACK-5 finding 7)
 * ---------------------------------------------------------
 * The raw delta is ~27 tables, not two. Twenty-five of them are `public` scratch
 * tables a previous measurement campaign left on the BRANCH, and the chair has
 * already dispositioned them. A gate that counted those into its exit code would
 * be red forever and would therefore be read by nobody — the worst possible end
 * for a gate. A gate that swallowed a real `platform` table into the same bucket
 * would be green while the rehearsal stood in for a production it no longer
 * matches. Both failures are invisible against a live database that happens to
 * be healthy today, which is why `scripts/__tests__/db-objects-diff-classify.test.ts`
 * asserts them against a fixed delta set instead of a live run.
 *
 * THE THREE CLASSES — and why there are three, not two
 * ---------------------------------------------------
 *   · `ruling`  — the lane's own definition: any object in `platform`, `iam` or
 *                 `history` one database has and the other does not, or any
 *                 difference in a column, constraint or trigger of such an
 *                 object. These, and ONLY these, set the exit code.
 *   · `noise`   — the 25 named `public` scratch tables, plus anything under the
 *                 reserved prefixes `corpus.*`, `campaign_watch.*` and
 *                 `zz_<lane>_*`. Printed under its own heading, never mixed in,
 *                 never counted.
 *   · `outside` — everything else: a delta in `agent`, `workflow`, `storage`,
 *                 `auth`… The lane's text classifies neither way, so this module
 *                 refuses to silently pick one. It is PRINTED, loudly, under its
 *                 own heading, and explicitly does NOT move the exit code —
 *                 because the entry check rules on three schemas and inventing a
 *                 fourth rule here would be this tool deciding a chair question.
 *                 A reader who sees a surprise there raises it; nothing hides.
 *
 * Kept free of `import.meta` and of every ESM-only dependency so ts-jest
 * (CommonJS) compiles it byte for byte the same way `tsx` does — the same reason
 * `scripts/lib/direct-db-env.ts` was split out of `direct-db.ts`.
 */

/**
 * The object kinds the entry check names, then the ones only the `full` inventory reads
 * (`scripts/lib/db-objects-inventory.ts` — the ledger-rebase proof, lane LEDGER-REBASE).
 * A `full`-only kind with no owning table carries `table: null`.
 */
export type ObjectKind =
  | "table"
  | "column"
  | "constraint"
  | "trigger"
  | "event_trigger"
  | "function"
  | "view"
  | "acl"
  | "policy"
  | "index"
  | "schema";

/** Which side has it — "differs" means both have it and the definitions disagree. */
export type Direction = "production_only" | "branch_only" | "differs";

export interface DeltaObject {
  readonly kind: ObjectKind;
  /** `null` only for event triggers, which are cluster-global. */
  readonly schema: string | null;
  /** The OWNING table for a column/constraint/trigger; the table itself for `table`. */
  readonly table: string | null;
  /** Column / constraint / trigger / table / event-trigger name. */
  readonly name: string;
}

export interface Delta {
  readonly object: DeltaObject;
  readonly direction: Direction;
  /** Present on `differs` — the two definitions, verbatim, so the reader judges. */
  readonly productionSignature?: string;
  readonly branchSignature?: string;
}

export type DeltaClass = "ruling" | "noise" | "outside";

export interface Verdict {
  readonly cls: DeltaClass;
  /** Why, in words, so a printed line never needs this file open beside it. */
  readonly reason: string;
}

/** The three schemas the `W0-TGT-FE` entry rules on. */
export const RULING_SCHEMAS: ReadonlySet<string> = new Set(["platform", "iam", "history"]);

/**
 * The 25 `public` scratch tables the previous measurement campaign left on the
 * BRANCH, named one by one in the entry. Exact names only: `m_record_archive` is
 * NOT `m_record`, and a prefix match here would silently pre-rule a real table.
 */
export const NOISE_PUBLIC_TABLES: ReadonlySet<string> = new Set([
  "h2_reldoc",
  "m2_record",
  "m3_node",
  "m3_reach",
  "m4_outbox",
  "m4_r4",
  "m4_r10",
  "m4_r20",
  "m4_r20_toast",
  "m4_r40",
  "m4c_r4",
  "m4c_r10",
  "m4c_r20",
  "m4c_r40",
  "m5_cell",
  "m5_option",
  "m5_record",
  "m_association_types",
  "m_associations",
  "m_grant",
  "m_lat",
  "m_reachability",
  "m_record",
  "m_results",
  "m_visibility_version",
]);

/** Reserved namespaces the entry pre-rules wholesale, in either direction. */
export const RESERVED_NOISE_SCHEMAS: ReadonlySet<string> = new Set(["corpus", "campaign_watch"]);

/** `zz_<lane>_*` — lane scratch, wherever it appears. */
export const LANE_SCRATCH_PREFIX = "zz_";

/**
 * Which class a single delta falls in. Order matters: the scratch rules run
 * BEFORE the ruling-schema rule, so a `zz_w0_probe` table a lane left inside
 * `platform` is the scratch it is, not a chair ruling.
 */
export function classifyDelta(object: DeltaObject): Verdict {
  const { kind, schema, table, name } = object;

  if (kind === "event_trigger") {
    return {
      cls: "ruling",
      reason:
        "event trigger — cluster-global, has no schema to sort it by, and our DDL guards live here",
    };
  }

  const owner = table ?? name;

  if (schema && RESERVED_NOISE_SCHEMAS.has(schema)) {
    return { cls: "noise", reason: `reserved namespace ${schema}.* — pre-ruled by W0-TGT-FE` };
  }
  if (schema && schema.startsWith(LANE_SCRATCH_PREFIX)) {
    return { cls: "noise", reason: `lane scratch schema ${schema} (zz_<lane>_*) — pre-ruled` };
  }
  if (owner.startsWith(LANE_SCRATCH_PREFIX)) {
    return { cls: "noise", reason: `lane scratch object ${owner} (zz_<lane>_*) — pre-ruled` };
  }
  if (schema === "public" && NOISE_PUBLIC_TABLES.has(owner)) {
    return {
      cls: "noise",
      reason: `public.${owner} — one of the 25 measurement-campaign scratch tables, pre-ruled`,
    };
  }
  if (schema && RULING_SCHEMAS.has(schema)) {
    return { cls: "ruling", reason: `${schema} is a ruling schema for this entry check` };
  }
  return {
    cls: "outside",
    reason: `${schema ?? "(no schema)"} is outside platform/iam/history — printed, not gated`,
  };
}

export interface ClassifiedDelta extends Delta {
  readonly verdict: Verdict;
}

export interface Summary {
  readonly ruling: ClassifiedDelta[];
  readonly noise: ClassifiedDelta[];
  readonly outside: ClassifiedDelta[];
  readonly productionOnly: number;
  readonly branchOnly: number;
  readonly differs: number;
  /** Non-zero iff a RULING-class delta exists. Noise and outside never move it. */
  readonly exitCode: number;
}

/** Bucket every delta and compute the exit code the gate reports. */
export function summarise(deltas: readonly Delta[]): Summary {
  const classified: ClassifiedDelta[] = deltas.map((d) => ({
    ...d,
    verdict: classifyDelta(d.object),
  }));
  const of = (cls: DeltaClass) => classified.filter((d) => d.verdict.cls === cls);
  const dir = (d: Direction) => classified.filter((x) => x.direction === d).length;
  const ruling = of("ruling");
  return {
    ruling,
    noise: of("noise"),
    outside: of("outside"),
    productionOnly: dir("production_only"),
    branchOnly: dir("branch_only"),
    differs: dir("differs"),
    exitCode: ruling.length > 0 ? 1 : 0,
  };
}

/** How a delta prints, one line, identical in every heading. */
export function formatDelta(d: ClassifiedDelta): string {
  const o = d.object;
  const where =
    o.kind === "event_trigger"
      ? `event trigger ${o.name}`
      : o.kind === "table"
        ? `table ${o.schema}.${o.name}`
        : o.table === null
          ? `${o.kind} ${o.schema}.${o.name}`
          : `${o.kind} ${o.schema}.${o.table}.${o.name}`;
  if (d.direction === "differs") {
    return [
      `  DIFFERS      ${where}`,
      `                 production: ${d.productionSignature ?? "(none)"}`,
      `                 branch:     ${d.branchSignature ?? "(none)"}`,
    ].join("\n");
  }
  const side = d.direction === "production_only" ? "PRODUCTION-ONLY" : "BRANCH-ONLY    ";
  return `  ${side} ${where}`;
}

/**
 * Turn two side inventories into deltas. A side is `identity -> signature`; the
 * identity string must be built the same way on both sides by the caller.
 *
 * Objects whose OWNING TABLE exists on only one side are dropped here on
 * purpose: a branch-only table with twenty columns would otherwise print
 * twenty-one deltas saying one thing. The table-level delta says it once, and
 * the runner prints that suppression rule in its header so it is never silent.
 */
export function diffSides(
  production: ReadonlyMap<string, string>,
  branch: ReadonlyMap<string, string>,
  parse: (identity: string) => DeltaObject,
  tableExistsBothSides: (o: DeltaObject) => boolean,
): Delta[] {
  const out: Delta[] = [];
  const keys = new Set<string>([...production.keys(), ...branch.keys()]);
  for (const key of [...keys].sort()) {
    const p = production.get(key);
    const b = branch.get(key);
    if (p !== undefined && b !== undefined && p === b) continue;
    const object = parse(key);
    if (object.kind !== "table" && object.kind !== "event_trigger" && !tableExistsBothSides(object))
      continue;
    if (p === undefined) out.push({ object, direction: "branch_only", branchSignature: b });
    else if (b === undefined) out.push({ object, direction: "production_only", productionSignature: p });
    else
      out.push({ object, direction: "differs", productionSignature: p, branchSignature: b });
  }
  return out;
}
