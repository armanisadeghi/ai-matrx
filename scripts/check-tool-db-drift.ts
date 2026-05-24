#!/usr/bin/env npx tsx
/**
 * Tool-drift gate — the matrx-frontend half of the unified code↔DB system.
 *
 * The DATABASE (`public.tl_def`) is the single source of truth. This gate proves
 * the ACTUAL CODE matches it: it serializes the REAL Zod `argsSchema` of every
 * UI-first tool — the exact schema the dispatcher validates against at
 * features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk.ts
 * (`entry.schema.safeParse`) — and diffs it against tl_def.parameters. There is
 * NO intermediate file: the schema we check is the schema that runs.
 *
 * Descriptions are NOT checked — they are not code; they live only in the DB.
 *
 *   pnpm gate:tools
 *
 * Exit codes:
 *   0  code matches the DB (or creds absent — gate skipped with a warning)
 *   1  drift found (code ≠ DB)
 *   2  unexpected error / DB fetch failed
 *
 * When it fires: the DB is the source of truth, so bring the handler's Zod
 * (features/agents/ui-first-tools/tools/schemas.ts) to match tl_def — or, if the
 * DB itself is wrong, change it (admin API / migration), then match code. Never
 * push code→DB silently.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  memoryArgsSchema,
  requestTakeoverArgsSchema,
  storageArgsSchema,
  tasksArgsSchema,
  updatePlanArgsSchema,
  userArgsSchema,
  userTodosArgsSchema,
} from "../features/agents/ui-first-tools/tools/schemas";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// name → the REAL Zod schema the dispatcher runs (from registry.ts / schemas.ts).
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  user: userArgsSchema,
  update_plan: updatePlanArgsSchema,
  request_user_takeover: requestTakeoverArgsSchema,
  tasks: tasksArgsSchema,
  user_todos: userTodosArgsSchema,
  memory: memoryArgsSchema,
  storage: storageArgsSchema,
};

interface DbToolRow {
  name: string;
  parameters: Record<string, { type?: string | string[]; enum?: unknown[]; required?: boolean; [k: string]: unknown }> | null;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, { type?: string | string[]; enum?: unknown[]; [k: string]: unknown }>;
  required?: string[];
}

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";

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
        if (
          !key &&
          (k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ||
            k === "SUPABASE_PUBLISHABLE_KEY" ||
            k === "NEXT_PUBLIC_SUPABASE_ANON_KEY" ||
            k === "SUPABASE_ANON_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url, key };
}

async function fetchDbRows(url: string, key: string, names: string[]): Promise<DbToolRow[]> {
  const inList = names.map((n) => encodeURIComponent(n)).join(",");
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/tl_def?name=in.(${inList})&select=name,parameters`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
  });
  if (!res.ok) {
    console.error(`drift-check: Supabase fetch failed (${res.status}): ${await res.text()}`);
    process.exit(2);
  }
  return (await res.json()) as DbToolRow[];
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

function compareTool(name: string, schema: z.ZodTypeAny, db: DbToolRow): string[] {
  const issues: string[] = [];
  const js = toObjectSchema(name, schema);
  const localProps = js.properties ?? {};
  const dbProps = db.parameters ?? {};

  const localFields = asSet(Object.keys(localProps));
  const dbFields = asSet(Object.keys(dbProps));
  const f = setDiff(localFields, dbFields);
  if (f.onlyA.length) issues.push(`fields only in code: ${f.onlyA.join(", ")}`);
  if (f.onlyB.length) issues.push(`fields only in DB: ${f.onlyB.join(", ")}`);

  const localRequired = asSet(js.required);
  const dbRequired = asSet(
    Object.entries(dbProps)
      .filter(([, d]) => d && (d as { required?: boolean }).required === true)
      .map(([k]) => k),
  );
  const r = setDiff(localRequired, dbRequired);
  if (r.onlyA.length) issues.push(`required only in code: ${r.onlyA.join(", ")}`);
  if (r.onlyB.length) issues.push(`required only in DB: ${r.onlyB.join(", ")}`);

  for (const field of localFields) {
    if (!dbFields.has(field)) continue;
    const l = localProps[field] ?? {};
    const d = dbProps[field] ?? {};
    const lType = Array.isArray(l.type) ? [...l.type].sort().join("|") : l.type;
    const dType = Array.isArray(d.type) ? [...d.type].sort().join("|") : d.type;
    if (lType && dType && lType !== dType) {
      issues.push(`${field}: type differs (code=${lType}, db=${dType})`);
    }
    const le = l.enum ? asSet((l.enum as unknown[]).map(String)) : null;
    const de = d.enum ? asSet((d.enum as unknown[]).map(String)) : null;
    // One-sided enum drift matters too: if the DB constrains a field to an enum
    // but the code uses a plain string (or vice-versa), the model and the
    // dispatcher disagree on what's valid. (Without this, "fixing" a drift by
    // deleting the Zod enum would falsely go green.)
    if (le && !de) {
      issues.push(`${field}: code constrains to enum ${JSON.stringify([...le])} but DB has no enum`);
    } else if (!le && de) {
      issues.push(`${field}: DB constrains to enum ${JSON.stringify([...de])} but code has no enum`);
    } else if (le && de) {
      const ed = setDiff(le, de);
      if (ed.onlyA.length || ed.onlyB.length) {
        issues.push(`${field}: enum drift (code-only=${JSON.stringify(ed.onlyA)}, db-only=${JSON.stringify(ed.onlyB)})`);
      }
    }
  }
  return issues;
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

  console.log(`Tool-DB drift check — matrx-frontend UI-first Zod ↔ public.tl_def`);
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
    console.log(`${RED}✗ In code but MISSING in tl_def (${missingInDb.length}):${RESET}`);
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
  console.log(`${DIM}Fix path — the DATABASE (public.tl_def) is the source of truth:${RESET}`);
  console.log(`${DIM}  - Bring the Zod in features/agents/ui-first-tools/tools/schemas.ts to match tl_def.${RESET}`);
  console.log(`${DIM}  - If the DB itself is wrong, change it (admin API / migration), then match code.${RESET}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("drift-check: unexpected error");
  console.error(err);
  process.exit(2);
});
