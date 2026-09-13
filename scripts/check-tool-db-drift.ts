#!/usr/bin/env npx tsx
/**
 * Tool-drift gate — the matrx-frontend half of the unified code↔DB system.
 *
 * `tool.definition` is the source of truth for REGISTERED tool contracts. This
 * gate proves the ACTUAL CODE for this registered set matches it: it serializes
 * the REAL Zod `argsSchema` of every
 * UI-first tool — the exact schema the dispatcher validates against at
 * features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk.ts
 * (`entry.schema.safeParse`) — and diffs it against
 * `tool.definition.parameters`. There is NO intermediate file: the schema we
 * check is the schema that runs.
 *
 * What it checks per tool — the shared "what match means" spec across all three
 * surfaces (aidream, matrx-extend, matrx-frontend; see common-docs/systems/agents/agent-tools/STATE.md):
 * the argument set, and for every field its type, required-ness, enum members
 * (incl. one-sided), DEFAULT, string length bounds (minLength/maxLength), number
 * range bounds (minimum/maximum/exclusiveMinimum/exclusiveMaximum), and — for
 * `array` fields — the ITEM shape: a scalar item's type + bounds, and an object
 * item's properties recursively under the same rules. A DB `items` that is a
 * bare `{"type":"object"}` while the code's item is a typed object is drift
 * ("items shape only in code"): the dispatcher then enforces constraints the
 * model was never told (2026-09-12: `user` batched form, `header` 16 chars vs
 * `max(12)` inside `questions.items` — rejected AFTER the server had suspended
 * the run). tier / admin_only / category are part of the
 * shared spec but are NOT checked HERE: unlike matrx-extend's catalog manifest,
 * the frontend registry declares only `{schema, handler}` — those three are
 * DB-only metadata this surface never redeclares, so there is nothing in code to
 * diff them against (checking them would be the forbidden DB→DB compare, Rule 5).
 *
 * Descriptions are NOT checked — they are not code; they live only in the DB.
 * Runtime ownership is separate: these six tools have active `tool.binding` rows
 * for executor `matrx-user`, and `tool.surface_defaults` advertises them on
 * `matrx-user/chat`. `tasks` and `memory` are also advertised there but execute on
 * `matrx-ai-core`, so they correctly have no `matrx-user` binding and no frontend
 * Zod schema in this gate.
 *
 *   pnpm gate:tools
 *
 * Exit codes:
 *   0  code matches the DB (or creds absent — gate skipped with a warning)
 *   1  drift found (code ≠ DB)
 *   2  unexpected error / DB fetch failed
 *
 * Inline tools are the other permanent, first-class path and have no DB row;
 * this registered-tool gate intentionally does not inspect them. Durability is
 * the divider: a tool that existed before the request belongs in
 * `tool.definition`; a tool authored at request time belongs inline.
 *
 * When it fires: reconcile the registered contract deliberately. Bring the
 * handler's Zod schema to match `tool.definition`, or if the registered row is
 * wrong, change it through the admin API / migration and then match code. Never
 * push code→DB silently.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";
import { readAllRowsRest } from "@ai-matrx/data/db";
import {
  requestTakeoverArgsSchema,
  updatePlanArgsSchema,
  userArgsSchema,
  userTodosArgsSchema,
} from "../features/agents/ui-first-tools/tools/schemas";

// `process.cwd()`, not `import.meta.url`: the jest self-test imports this
// module, and jest transpiles it to CommonJS where `import.meta` is a syntax
// error. Same posture as scripts/check-mandate-keys.ts. Every entry point runs
// it from the repo root (pnpm, run-release-gates.sh, CI).
const ROOT = process.cwd();

// name → the REAL Zod schema the dispatcher runs (from registry.ts / schemas.ts).
// `tasks` is intentionally absent: it is server-executed in aidream now, so the
// aidream drift gate (aidream/startup/tools_check.py) owns its code↔DB check.
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  user: userArgsSchema,
  update_plan: updatePlanArgsSchema,
  request_user_takeover: requestTakeoverArgsSchema,
  user_todos: userTodosArgsSchema,
};

/** One field's schema on either side (JSON-Schema-ish; the DB adds `required: true`). */
export interface FieldSchema {
  type?: string | string[];
  enum?: unknown[];
  required?: boolean | string[];
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  [k: string]: unknown;
}

export interface DbToolRow {
  name: string;
  parameters: Record<string, FieldSchema> | null;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, FieldSchema>;
  required?: string[];
}

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // ONE name each — no second candidate, no fallback chain. (The old
  // *_ANON_KEY names are deprecated and BANNED by eslint.config.mjs.)
  // See common-docs/policies/package-vs-implementation.md
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = (raw ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && k === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url, key };
}

async function fetchDbRows(url: string, key: string, names: string[]): Promise<DbToolRow[]> {
  const inList = names.map((n) => encodeURIComponent(n)).join(",");
  // Paged through readAllRowsRest: this set-diffs DB rows against the code Zod
  // schemas, so a PostgREST 1000-row truncation would invent "MISSING in
  // tool.definition" tools. See readAllRows in @ai-matrx/data/db.
  try {
    return await readAllRowsRest<DbToolRow>({
      url,
      key,
      // `tool.definition` lives in the `tool` schema; reach it via the tool profile.
      schema: "tool",
      path: `definition?name=in.(${inList})&select=name,parameters&order=name.asc`,
      label: "tool.definition",
    });
  } catch (err) {
    console.error(`drift-check: Supabase fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

/** Serialize a Zod schema to a JSON-Schema object (Zod v4 native). */
function toObjectSchema(name: string, schema: z.ZodTypeAny): JsonSchemaObject {
  try {
    // `unrepresentable: "any"` keeps refinements/superRefine from throwing.
    return z.toJSONSchema(schema, { unrepresentable: "any" }) as JsonSchemaObject;
  } catch (err) {
    console.error(`drift-check: could not serialize Zod for "${name}":`, err);
    process.exit(2);
  }
}

function asSet<T>(xs: T[] | undefined | null): Set<T> {
  return new Set(xs ?? []);
}
function setDiff<T>(a: Set<T>, b: Set<T>): { onlyA: T[]; onlyB: T[] } {
  const onlyA: T[] = [];
  const onlyB: T[] = [];
  for (const x of a) if (!b.has(x)) onlyA.push(x);
  for (const x of b) if (!a.has(x)) onlyB.push(x);
  return { onlyA, onlyB };
}

/**
 * Required-field set of an object on the DB side. `tool.definition.parameters`
 * marks top-level fields with `required: true` on the field itself; a nested
 * `items` object (real JSON Schema) carries a `required: [...]` array. Accept
 * both so a nested row written either way compares honestly.
 */
function dbRequiredSet(props: Record<string, FieldSchema>, container?: FieldSchema): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(container?.required)) for (const k of container.required) out.add(String(k));
  for (const [k, d] of Object.entries(props)) if (d && d.required === true) out.add(k);
  return out;
}

const BOUND_KEYS = [
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
] as const;

/**
 * Length / range bounds — the constraints the dispatcher enforces that the
 * model can only learn from the DB row. One-sided or differing is drift.
 */
function compareBounds(path: string, l: FieldSchema, d: FieldSchema): string[] {
  const issues: string[] = [];
  for (const k of BOUND_KEYS) {
    const lv = l[k];
    const dv = d[k];
    const lHas = lv !== undefined;
    const dHas = dv !== undefined;
    if (lHas !== dHas) {
      issues.push(`${path}: ${k} ${lHas ? `only in code (${JSON.stringify(lv)})` : `only in DB (${JSON.stringify(dv)})`}`);
    } else if (lHas && dHas && lv !== dv) {
      issues.push(`${path}: ${k} differs (code=${JSON.stringify(lv)}, db=${JSON.stringify(dv)})`);
    }
  }
  return issues;
}

function normType(t: string | string[] | undefined): string | undefined {
  return Array.isArray(t) ? [...t].sort().join("|") : t;
}

/**
 * Compare one property set (top-level parameters, or an array item's object
 * properties) — the shared per-field rules, applied at every depth.
 */
export function compareFields(
  prefix: string,
  localProps: Record<string, FieldSchema>,
  localRequired: Set<string>,
  dbProps: Record<string, FieldSchema>,
  dbRequired: Set<string>,
): string[] {
  const issues: string[] = [];
  const at = (field: string) => `${prefix}${field}`;

  const localFields = asSet(Object.keys(localProps));
  const dbFields = asSet(Object.keys(dbProps));
  const f = setDiff(localFields, dbFields);
  if (f.onlyA.length) issues.push(`${prefix}fields only in code: ${f.onlyA.join(", ")}`);
  if (f.onlyB.length) issues.push(`${prefix}fields only in DB: ${f.onlyB.join(", ")}`);

  const r = setDiff(localRequired, dbRequired);
  if (r.onlyA.length) issues.push(`${prefix}required only in code: ${r.onlyA.join(", ")}`);
  if (r.onlyB.length) issues.push(`${prefix}required only in DB: ${r.onlyB.join(", ")}`);

  for (const field of localFields) {
    if (!dbFields.has(field)) continue;
    const l = localProps[field] ?? {};
    const d = dbProps[field] ?? {};
    const lType = normType(l.type);
    const dType = normType(d.type);
    if (lType && dType && lType !== dType) {
      issues.push(`${at(field)}: type differs (code=${lType}, db=${dType})`);
    }
    const le = l.enum ? asSet((l.enum as unknown[]).map(String)) : null;
    const de = d.enum ? asSet((d.enum as unknown[]).map(String)) : null;
    // One-sided enum drift matters too: if the DB constrains a field to an enum
    // but the code uses a plain string (or vice-versa), the model and the
    // dispatcher disagree on what's valid. (Without this, "fixing" a drift by
    // deleting the Zod enum would falsely go green.)
    if (le && !de) {
      issues.push(`${at(field)}: code constrains to enum ${JSON.stringify([...le])} but DB has no enum`);
    } else if (!le && de) {
      issues.push(`${at(field)}: DB constrains to enum ${JSON.stringify([...de])} but code has no enum`);
    } else if (le && de) {
      const ed = setDiff(le, de);
      if (ed.onlyA.length || ed.onlyB.length) {
        issues.push(`${at(field)}: enum drift (code-only=${JSON.stringify(ed.onlyA)}, db-only=${JSON.stringify(ed.onlyB)})`);
      }
    }

    // Default value — the last piece of the shared "what match means" spec
    // (common-docs/systems/agents/agent-tools/HANDOFF.md; mirrors matrx-extend's checker). A default
    // on one side but not the other, or differing defaults, is real drift: the
    // model and the dispatcher disagree on what an omitted field becomes.
    const lDef = l.default;
    const dDef = d.default;
    const lHasDef = lDef !== undefined;
    const dHasDef = dDef !== undefined;
    if (lHasDef !== dHasDef) {
      issues.push(
        `${at(field)}: default ${lHasDef ? `only in code (${JSON.stringify(lDef)})` : `only in DB (${JSON.stringify(dDef)})`}`,
      );
    } else if (lHasDef && dHasDef && JSON.stringify(lDef) !== JSON.stringify(dDef)) {
      issues.push(
        `${at(field)}: default differs (code=${JSON.stringify(lDef)}, db=${JSON.stringify(dDef)})`,
      );
    }

    // String length / number range bounds on the field itself.
    issues.push(...compareBounds(at(field), l, d));

    // Array items. The dispatcher validates every element against the code's
    // `items`; the model only ever sees the DB's. A bare `{"type":"object"}`
    // in the DB opposite a typed object item in code hides every nested
    // constraint from the model — exactly the 2026-09-12 `user.questions`
    // incident. Scalar items are compared on type + bounds; object items
    // recurse through this same function. Items the serializer expresses as
    // `anyOf` (unions, nullable) carry no `type`/`properties` and are skipped
    // here, the same rule the top-level fields already follow.
    if (lType === "array" && l.items && typeof l.items === "object") {
      const li = l.items;
      const di = d.items;
      const itemPath = `${at(field)}.items`;
      if (li.properties && Object.keys(li.properties).length > 0) {
        if (!di || !di.properties || Object.keys(di.properties).length === 0) {
          issues.push(
            `${itemPath}: items shape only in code (code item has properties [${Object.keys(li.properties).join(", ")}]; ` +
              `db items=${di ? JSON.stringify(di) : "absent"})`,
          );
        } else {
          issues.push(
            ...compareFields(
              `${itemPath}.`,
              li.properties,
              asSet(Array.isArray(li.required) ? li.required : []),
              di.properties,
              dbRequiredSet(di.properties, di),
            ),
          );
        }
      } else if (normType(li.type)) {
        if (!di) {
          issues.push(`${itemPath}: items only in code (${JSON.stringify(li)})`);
        } else {
          const liT = normType(li.type);
          const diT = normType(di.type);
          if (liT && diT && liT !== diT) {
            issues.push(`${itemPath}: type differs (code=${liT}, db=${diT})`);
          }
          issues.push(...compareBounds(itemPath, li, di));
        }
      }
    }
  }
  return issues;
}

export function compareTool(name: string, schema: z.ZodTypeAny, db: DbToolRow): string[] {
  const js = toObjectSchema(name, schema);
  const localProps = js.properties ?? {};
  // `$`-prefixed keys ($variants, …) are contract metadata, NOT tool parameters.
  // They never appear in code and must not be compared as fields.
  const dbProps = Object.fromEntries(
    Object.entries(db.parameters ?? {}).filter(([k]) => !k.startsWith("$")),
  );
  return compareFields("", localProps, asSet(js.required), dbProps, dbRequiredSet(dbProps));
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env) {
    console.warn(
      "drift-check: Supabase creds not found — SKIPPING the code↔DB tool gate (cannot " +
        "verify without DB access). A build/CI with creds present enforces it.",
    );
    process.exit(0);
  }

  const names = Object.keys(SCHEMAS);
  const dbRows = await fetchDbRows(env.url, env.key, names);
  const dbByName = new Map(dbRows.map((r) => [r.name, r]));

  const drifts: { name: string; issues: string[] }[] = [];
  const missingInDb: string[] = [];
  for (const name of names) {
    const db = dbByName.get(name);
    if (!db) {
      missingInDb.push(name);
      continue;
    }
    const issues = compareTool(name, SCHEMAS[name]!, db);
    if (issues.length) drifts.push({ name, issues });
  }

  const total = drifts.length + missingInDb.length;
  const isTTY = process.stdout.isTTY && process.env.NO_COLOR !== "1";
  const RED = isTTY ? "\x1b[1;91m" : "";
  const RED_BG = isTTY ? "\x1b[1;97;41m" : "";
  const GREEN = isTTY ? "\x1b[1;92m" : "";
  const DIM = isTTY ? "\x1b[2m" : "";
  const RESET = isTTY ? "\x1b[0m" : "";

  console.log(`Tool-DB drift check — matrx-frontend UI-first Zod ↔ tool.definition`);
  console.log(`  code tools (real Zod): ${names.length}   DB rows matched: ${dbByName.size}`);
  console.log("");

  if (total === 0) {
    console.log(`${GREEN}✓ No drift — every UI-first tool's real Zod matches the DB.${RESET}`);
    process.exit(0);
  }

  const bar = "█".repeat(68);
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log(`${RED}⚠  TOOL CODE ↔ DB DRIFT — ${total} problem(s). The model sees one schema; the dispatcher accepts another.${RESET}`);
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log("");

  if (missingInDb.length) {
    console.log(`${RED}✗ In code but MISSING in tool.definition (${missingInDb.length}):${RESET}`);
    for (const n of missingInDb) console.log(`    ${DIM}-${RESET} ${n}`);
    console.log("");
  }
  if (drifts.length) {
    console.log(`${RED}✗ Schema drift in ${drifts.length} tool(s):${RESET}`);
    for (const d of drifts) {
      console.log(`  ${RED}•${RESET} ${d.name}`);
      for (const i of d.issues) console.log(`      ${DIM}-${RESET} ${i}`);
    }
    console.log("");
  }
  console.log(`${DIM}Fix path — the DATABASE (tool.definition) is the source of truth:${RESET}`);
  console.log(`${DIM}  - Bring the Zod in features/agents/ui-first-tools/tools/schemas.ts to match tool.definition.${RESET}`);
  console.log(`${DIM}  - If the DB itself is wrong, change it (admin API / migration), then match code.${RESET}`);
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("drift-check: unexpected error");
    console.error(err);
    process.exit(2);
  });
}
