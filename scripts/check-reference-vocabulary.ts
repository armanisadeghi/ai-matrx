/**
 * check:reference-vocabulary — Guard 5 of the Unified Data System (v6 lane INTEGRATION, W2.2):
 * EVERY MODULE IS SOMETHING A TABLE'S REFERENCE COLUMN CAN POINT AT, OR THE GAP IS COUNTED.
 *
 * A reference column names platform things — a note, an agent, a meeting, a form — through ONE
 * door, `custom.entity_reference_kinds()` (the registered `record → <token>` association types).
 * Until W2.2 it listed 109 kinds and none of a meeting, a mandate, a form or a booking page, and
 * nothing would have said so when the next module shipped. This census closes that class: the
 * platform's modules are read from real sources, each one is either a kind or sits in the
 * exclusion map below with its reason, and the map can only shrink.
 *
 * WHERE "THE MODULES" COME FROM — no hand list of tokens:
 *   1. REGISTRY: `platform.entity_types` rows that are active, not a component, and carry a
 *      `user_artifact_kind` — the registry's own statement that a person makes this kind of thing.
 *   2. DATA HOME: the products the data home lists (`id:` of each capability in
 *      `features/unified-data/hub/capabilities.ts`) — forms, bookings, portals, dashboards … are
 *      store objects, not registry tokens, so each id maps in `PRODUCTS` to the token(s) that
 *      carry it or to an exclusion reason. A new product with no line there fails.
 *   3. NAMED: the modules the lane's item 5 names that neither source carries (a CMS page, an
 *      email thread, an SMS thread). Documented, never silently dropped.
 *
 * WHAT FAILS (RED):
 *   - a registry module with no kind and no line in `EXCLUDED`;
 *   - a data-home product with no line in `PRODUCTS`, or whose mapped token is not a kind;
 *   - a NAMED module mapped to a token that is not a kind;
 *   - STALE: an `EXCLUDED` token that now IS a kind, or is no longer a registry module (a stale
 *     line hides the very gap it claims), or a `PRODUCTS` line for an id the data home dropped;
 *   - more `UNMEASURED` exclusions than `UNMEASURED_BASELINE` (it only shrinks).
 *
 *   pnpm check:reference-vocabulary                       live (the default), read only, one statement
 *   pnpm check:reference-vocabulary --target clone        the nightly copy
 *   pnpm check:reference-vocabulary --self-test           planted in memory: every RED, then GREEN
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "..");
const CAPABILITIES = join(REPO, "features/unified-data/hub/capabilities.ts");

export const REASONS = {
  /** A presumed-owed gap nobody has measured yet; counted so the number can only fall. */
  UNMEASURED:
    "A module a person makes, with no reference kind. Not measured whether it needs a name column, " +
    "a route or an access answer first; a kind is presumed OWED.",
  /** The store already reaches it through its own column kind. */
  REACHED_ANOTHER_WAY:
    "The record store reaches it through its own column: a File column, a Person column, or a " +
    "relation to a custom table. An entity reference to it would be a second way to say one thing.",
  /** Not a registered entity type, so no door can name, check or label it. */
  NOT_REGISTERED:
    "Stored in a table platform.entity_types does not register, so the reference doors cannot " +
    "check access to it or read its name. Registering it is a registry change the chair owns.",
  /** A store record (data_class), reached by no relation target. */
  IS_A_STORE_RECORD:
    "A store record in a kernel Table (a dashboard is a presentation record). The entity doors " +
    "refuse `record`, and a relation reaches only a Table of the organization or the File and " +
    "Person kernels; reaching it needs a store relation-target change the chair owns.",
  /** Lives outside this database. */
  OTHER_DATABASE: "Lives in another database (the CMS project), which no reference door can read.",
  /** No entity of this kind exists on the platform yet. */
  NO_ENTITY: "No entity of this kind exists on the platform database; there is nothing to point at yet.",
  /** The access resolver disagrees with the module's own owner column. */
  ACCESS_DISAGREES:
    "iam.has_access answers from created_by while the thread's owner is user_id, so its own owner " +
    "would be refused. Fixing the resolver is an access-rule change the chair owns.",
  /** Not a thing: a view of other things. */
  NOT_A_THING: "A view over other things (what is shared, and with whom), not a thing of its own.",
} as const;
export type ReasonKey = keyof typeof REASONS;

/** Registry modules with no kind, each with its reason. Only shrinks. */
export const EXCLUDED: Readonly<Record<string, ReasonKey>> = {
  file: "REACHED_ANOTHER_WAY",
  scope: "REACHED_ANOTHER_WAY",
  agent_mandate_note: "UNMEASURED",
  agent_run: "UNMEASURED",
  agent_term_list: "UNMEASURED",
  billing_spend_guardrail: "UNMEASURED",
  board: "UNMEASURED",
  browser_profile: "UNMEASURED",
  comment: "UNMEASURED",
  commerce_certified_printer: "UNMEASURED",
  commerce_intake_batch: "UNMEASURED",
  credential_item: "UNMEASURED",
  crm_blocklist_entry: "UNMEASURED",
  document: "UNMEASURED",
  fc_card: "UNMEASURED",
  hr_employment: "UNMEASURED",
  hr_jurisdiction_rule_org_decision: "UNMEASURED",
  interview_decision_interview: "UNMEASURED",
  interview_session: "UNMEASURED",
  media_source_library: "UNMEASURED",
  plan_entity: "UNMEASURED",
  plan_node: "UNMEASURED",
  platform_saved_view: "UNMEASURED",
  product_capture_item: "UNMEASURED",
  sandbox_instance: "UNMEASURED",
  seo_engine_schedule: "UNMEASURED",
  seo_keyword_class_rule: "UNMEASURED",
  seo_rank_target: "UNMEASURED",
  seo_topical_map: "UNMEASURED",
  study_session: "UNMEASURED",
  system_announcement: "UNMEASURED",
  user_feedback: "UNMEASURED",
  user_memory: "UNMEASURED",
  wbx_highlight: "UNMEASURED",
  workflow_runtime_surface: "UNMEASURED",
};
export const UNMEASURED_BASELINE = 33;

type Mapping = { readonly tokens: readonly string[] } | { readonly excluded: ReasonKey };

/** Every product the data home lists, mapped to the token(s) that carry it or a reason. */
export const PRODUCTS: Readonly<Record<string, Mapping>> = {
  tables: { excluded: "REACHED_ANOTHER_WAY" },
  forms: { tokens: ["anon_form"] },
  bookings: { tokens: ["anon_form"] },
  portals: { excluded: "NOT_REGISTERED" },
  dashboards: { excluded: "IS_A_STORE_RECORD" },
  digests: { excluded: "UNMEASURED" },
  checklists: { excluded: "UNMEASURED" },
  automations: { excluded: "UNMEASURED" },
  "shared-outside": { excluded: "NOT_A_THING" },
  "shared-with-me": { excluded: "NOT_A_THING" },
};

/** Item 5's modules that neither source carries as a module. */
export const NAMED: Readonly<Record<string, Mapping>> = {
  "meet meeting": { tokens: ["meet_meeting"] },
  mandate: { tokens: ["mandate"] },
  "CMS page": { excluded: "OTHER_DATABASE" },
  "email thread": { excluded: "NO_ENTITY" },
  "SMS thread": { excluded: "ACCESS_DISAGREES" },
};

export interface Census {
  /** Registry module tokens (source 1). */
  readonly modules: readonly string[];
  /** `custom.entity_reference_kinds()` tokens. */
  readonly kinds: readonly string[];
  /** Data-home capability ids (source 2). */
  readonly products: readonly string[];
}

export interface Verdict {
  readonly red: string[];
  readonly counted: number;
}

export function judge(
  c: Census,
  excluded: Readonly<Record<string, ReasonKey>> = EXCLUDED,
  products: Readonly<Record<string, Mapping>> = PRODUCTS,
  named: Readonly<Record<string, Mapping>> = NAMED,
  baseline: number = UNMEASURED_BASELINE,
): Verdict {
  const kinds = new Set(c.kinds);
  const modules = new Set(c.modules);
  const red: string[] = [];
  for (const m of [...modules].sort()) {
    if (!kinds.has(m) && !(m in excluded)) red.push(`module "${m}" has no reference kind and no line in EXCLUDED`);
  }
  for (const [t, why] of Object.entries(excluded)) {
    if (!(why in REASONS)) red.push(`EXCLUDED "${t}" carries an unknown reason "${why}"`);
    if (kinds.has(t)) red.push(`STALE: EXCLUDED "${t}" is a reference kind now; remove its line`);
    else if (!modules.has(t)) red.push(`STALE: EXCLUDED "${t}" is no longer a registry module; remove its line`);
  }
  const checkMapping = (where: string, key: string, m: Mapping | undefined) => {
    if (!m) return red.push(`${where} "${key}" has no line: map it to its token(s) or an exclusion reason`);
    if ("tokens" in m) {
      for (const t of m.tokens) if (!kinds.has(t)) red.push(`${where} "${key}" maps to "${t}", which is not a reference kind`);
    } else if (!(m.excluded in REASONS)) red.push(`${where} "${key}" carries an unknown reason "${m.excluded}"`);
    return undefined;
  };
  const productIds = new Set(c.products);
  for (const id of [...productIds].sort()) checkMapping("data-home product", id, products[id]);
  for (const id of Object.keys(products)) if (!productIds.has(id)) red.push(`STALE: PRODUCTS "${id}" is no longer a data-home product`);
  for (const [k, m] of Object.entries(named)) checkMapping("named module", k, m);
  const counted = Object.values(excluded).filter((r) => r === "UNMEASURED").length;
  if (counted > baseline) red.push(`${counted} UNMEASURED exclusions, above the baseline of ${baseline}: the map only shrinks`);
  return { red, counted };
}

/** Source 2: the data home's capability ids, read from the file that lists them. */
export function productIds(source: string): string[] {
  const start = source.indexOf("export const HUB_CAPABILITIES");
  const body = start >= 0 ? source.slice(start) : source;
  return [...body.matchAll(/^ {4}id: "([a-z][a-z0-9-]*)",$/gm)].map((m) => m[1]!);
}

export const CENSUS_SQL = `
select
  (select coalesce(array_agg(e.token order by e.token), '{}')
     from platform.entity_types e
    where e.is_active and not e.is_component and e.user_artifact_kind is not null) as modules,
  (select coalesce(array_agg(k.token order by k.token), '{}') from custom.entity_reference_kinds() k) as kinds`;

function selfTest(): number {
  const green: Census = {
    modules: ["note", "meet_meeting", "board"],
    kinds: ["note", "meet_meeting", "mandate", "anon_form"],
    products: ["forms", "portals"],
  };
  const ex = { board: "UNMEASURED" } as const;
  const pr: Record<string, Mapping> = { forms: { tokens: ["anon_form"] }, portals: { excluded: "NOT_REGISTERED" } };
  const nm: Record<string, Mapping> = { mandate: { tokens: ["mandate"] } };
  const ok = judge(green, ex, pr, nm, 1);
  if (ok.red.length) throw new Error(`the green census must be green: ${ok.red.join("; ")}`);
  const plants: Array<[string, Verdict, RegExp]> = [
    ["a new module without a kind", judge({ ...green, modules: [...green.modules, "booking_widget"] }, ex, pr, nm, 1), /module "booking_widget" has no reference kind/],
    ["a kind withdrawn from a module", judge({ ...green, kinds: green.kinds.filter((k) => k !== "meet_meeting") }, ex, pr, nm, 1), /module "meet_meeting" has no reference kind/],
    ["a stale exclusion (now a kind)", judge({ ...green, kinds: [...green.kinds, "board"] }, ex, pr, nm, 1), /STALE: EXCLUDED "board" is a reference kind/],
    ["a stale exclusion (no longer a module)", judge({ ...green, modules: ["note", "meet_meeting"] }, ex, pr, nm, 1), /STALE: EXCLUDED "board" is no longer/],
    ["a new data-home product", judge({ ...green, products: [...green.products, "kiosks"] }, ex, pr, nm, 1), /data-home product "kiosks" has no line/],
    ["a product whose token lost its kind", judge({ ...green, kinds: green.kinds.filter((k) => k !== "anon_form") }, ex, pr, nm, 1), /"forms" maps to "anon_form"/],
    ["a dropped product line", judge({ ...green, products: ["forms"] }, ex, pr, nm, 1), /STALE: PRODUCTS "portals"/],
    ["a named module whose kind went away", judge({ ...green, kinds: green.kinds.filter((k) => k !== "mandate") }, ex, pr, nm, 1), /named module "mandate" maps to "mandate"/],
    ["the baseline grows", judge(green, ex, pr, nm, 0), /above the baseline of 0/],
  ];
  for (const [name, v, re] of plants) {
    if (!v.red.some((r) => re.test(r))) throw new Error(`plant "${name}" must be RED, got: ${v.red.join("; ") || "green"}`);
  }
  const ids = productIds('export const HUB_CAPABILITIES = [\n  {\n    id: "forms",\n    x: { id: "nested" },\n  },\n  {\n    id: "shared-with-me",\n  },\n];');
  if (ids.join() !== "forms,shared-with-me") throw new Error(`productIds read ${ids.join()}`);
  console.log(`✓ self-test: ${plants.length} planted breaks are RED, the planted census is GREEN, product ids parse`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--self-test")) return selfTest();
  const { openCheckDb } = await import("./lib/check-target");
  const db = await openCheckDb({ gate: "check:reference-vocabulary", defaultTarget: "production", argv });
  let row: { modules: string[]; kinds: string[] };
  try {
    await db.client.query("begin read only");
    row = (await db.client.query(CENSUS_SQL)).rows[0] as typeof row;
    await db.client.query("rollback");
  } finally {
    await db.client.end().catch(() => undefined);
  }
  const products = productIds(readFileSync(CAPABILITIES, "utf8"));
  if (products.length === 0) {
    console.error("✗ read no data-home products from features/unified-data/hub/capabilities.ts — the census would measure nothing");
    return 1;
  }
  const v = judge({ modules: row.modules, kinds: row.kinds, products });
  const covered = row.modules.filter((m) => row.kinds.includes(m)).length;
  console.log(
    `reference vocabulary: ${row.kinds.length} kinds; ${row.modules.length} registry modules (${covered} are kinds, ` +
      `${row.modules.length - covered} excluded, ${v.counted}/${UNMEASURED_BASELINE} unmeasured); ` +
      `${products.length} data-home products; ${Object.keys(NAMED).length} named modules`,
  );
  if (v.red.length) {
    for (const r of v.red) console.error(`✗ ${r}`);
    return 1;
  }
  console.log("✓ every module is a reference kind or an excluded, reasoned line");
  return 0;
}

void main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exitCode = 1;
  },
);
