#!/usr/bin/env npx tsx
/**
 * Agent-sync field drift gate — TRUTH (the live Postgres function) vs CODE
 * (`AGENT_SYNC_FIELDS` in features/agents/sync/sync-fields.ts).
 *
 * `public.agx_sync_linked_agents(p_from_id, p_to_id, p_include_identity)` owns
 * ONE `UPDATE agent.definition SET ...` that copies the source agent's columns
 * onto the target — the identity group behind `CASE WHEN v_identity`, the
 * behavior group unconditionally. The TypeScript list is what every "are these
 * two agents the same?" / "what will Pull overwrite?" surface derives its
 * verdict from.
 *
 * If the two disagree there is NO compile error and NO runtime error — the UI
 * simply lies: a column the RPC writes but TS omits makes the comparison swear
 * two agents are identical while the sync silently overwrites that column. This
 * guard fetches the real state and diffs it against the code's assumption.
 *
 *   pnpm check:sync-fields            # offline, advisory — parses the snapshot
 *   pnpm check:sync-fields:strict     # exits non-zero on drift (CI / release)
 *   pnpm check:sync-fields:refresh    # re-pull the live function definition
 *
 * The committed snapshot (scripts/agent-sync-fields-snapshot.json) holds the
 * full `pg_get_functiondef()` text, so the default run needs no DB reach.
 *
 * Exit codes:
 *   0  no drift (or drift found in advisory mode — still printed loudly).
 *   1  drift found, --strict only.
 *   2  unexpected error / snapshot unusable.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import {
  AGENT_SYNC_FIELDS,
  type AgentSyncField,
  type AgentSyncFieldGroup,
} from "@/features/agents/sync/sync-fields";

const ROOT = resolve(__dirname, "..");
const SNAPSHOT_PATH = resolve(ROOT, "scripts/agent-sync-fields-snapshot.json");
const SNAPSHOT_REL = "scripts/agent-sync-fields-snapshot.json";

// ── What the function looks like. Constants, not env, not magic strings. ─────
const FUNCTION_SCHEMA = "public";
const FUNCTION_NAME = "agx_sync_linked_agents";
/** The plpgsql record variable holding the SOURCE agent's row. */
const SOURCE_RECORD = "v_from";
/** The plpgsql boolean gating the identity group. */
const IDENTITY_FLAG = "v_identity";
/** The table the sync UPDATE targets. */
const TARGET_TABLE = "agent.definition";
/** The RPC that dumps every routine in a schema (anon-executable via PostgREST). */
const ROUTINE_DUMP_RPC = "__dump_schema_routines";

// ── Snapshot shape ───────────────────────────────────────────────────────────
export interface SyncFunctionSnapshot {
  readonly generated_at: string;
  readonly project: string;
  readonly schema: string;
  readonly function: string;
  readonly source: string;
  readonly definition: string;
}

// ── Parser output ────────────────────────────────────────────────────────────
export interface ParsedSyncColumn {
  /** `agent.definition` column being written. */
  readonly column: string;
  /** identity = gated by the include-identity flag; behavior = always copied. */
  readonly group: AgentSyncFieldGroup;
  /** The `v_from.<x>` column actually read for this assignment. */
  readonly sourceColumn: string;
}

export interface ParsedSetClause {
  /** Columns the sync copies from the source row, in SET-clause order. */
  readonly columns: readonly ParsedSyncColumn[];
  /** Bookkeeping assignments deliberately skipped (e.g. `updated_at = now()`). */
  readonly ignored: readonly string[];
  /** Anything the parser could not classify — always loud, never silent. */
  readonly problems: readonly string[];
}

export interface DriftIssue {
  readonly column: string;
  readonly detail: string;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip `--` line comments and `/* *\/` block comments so they can't confuse the split. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

/**
 * Split a SET body on TOP-LEVEL commas only — commas inside parentheses or
 * string literals belong to an expression, not to the next assignment.
 */
function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      current += ch;
      if (ch === "'") inString = body[i + 1] === "'";
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Pull the SET body of the ONE sync UPDATE out of a function definition.
 *
 * The function contains a second `UPDATE agent.definition SET source_snapshot_at
 * = now()` — bookkeeping on a different row. We keep only the UPDATE whose SET
 * body reads from the source record (`v_from.`), and shout if that is ambiguous
 * instead of silently picking one.
 */
function extractSyncSetBody(sql: string): { body: string | null; problems: string[] } {
  const problems: string[] = [];
  const re = new RegExp(
    `update\\s+${escapeRegExp(TARGET_TABLE)}\\s+set\\b([\\s\\S]*?)(?:\\bwhere\\b|;)`,
    "gi",
  );
  const candidates: string[] = [];
  let match: RegExpExecArray | null = re.exec(sql);
  while (match !== null) {
    const body = match[1] ?? "";
    if (new RegExp(`\\b${escapeRegExp(SOURCE_RECORD)}\\.`, "i").test(body)) {
      const opens = (body.match(/\(/g) ?? []).length;
      const closes = (body.match(/\)/g) ?? []).length;
      if (opens !== closes) {
        problems.push(
          `the SET clause was cut mid-expression (unbalanced parentheses) — a subquery containing WHERE inside SET is not supported by this parser`,
        );
      }
      candidates.push(body);
    }
    match = re.exec(sql);
  }

  if (candidates.length === 0) {
    problems.push(
      `no "UPDATE ${TARGET_TABLE} SET ..." assigning from ${SOURCE_RECORD}.* found in ${FUNCTION_SCHEMA}.${FUNCTION_NAME} — the function was rewritten and this guard no longer understands it`,
    );
    return { body: null, problems };
  }
  if (candidates.length > 1) {
    problems.push(
      `${candidates.length} separate "UPDATE ${TARGET_TABLE} SET ..." statements copy from ${SOURCE_RECORD} — the sync must write its columns in ONE statement for this guard (and for any reader) to know what it does`,
    );
  }
  return { body: candidates[0] ?? null, problems };
}

/**
 * Parse the sync UPDATE's SET clause out of a `pg_get_functiondef()` text.
 *
 * Classification, per assignment:
 *   `col = CASE WHEN v_identity THEN v_from.col ELSE col END` → identity
 *   `col = v_from.col`                                        → behavior
 *   anything that reads neither v_from nor v_identity         → bookkeeping (ignored)
 *   anything else                                             → problem (loud)
 */
export function parseSyncSetClause(functionDefinition: string): ParsedSetClause {
  const sql = stripSqlComments(functionDefinition);
  const { body, problems: extractProblems } = extractSyncSetBody(sql);
  const problems: string[] = [...extractProblems];
  const columns: ParsedSyncColumn[] = [];
  const ignored: string[] = [];
  if (body === null) return { columns, ignored, problems };

  const src = escapeRegExp(SOURCE_RECORD);
  const flag = escapeRegExp(IDENTITY_FLAG);
  const identityRe = new RegExp(
    `^case\\s+when\\s+${flag}\\s+then\\s+${src}\\.([a-z_][a-z0-9_]*)\\s+else\\s+(?:${escapeRegExp(TARGET_TABLE)}\\.)?([a-z_][a-z0-9_]*)\\s+end$`,
    "i",
  );
  const behaviorRe = new RegExp(`^${src}\\.([a-z_][a-z0-9_]*)$`, "i");
  const readsSource = new RegExp(`\\b${src}\\.`, "i");
  const readsFlag = new RegExp(`\\b${flag}\\b`, "i");

  for (const raw of splitTopLevelCommas(body)) {
    const assignment = raw.replace(/\s+/g, " ").trim();
    const eq = assignment.indexOf("=");
    const nameMatch = assignment.slice(0, eq < 0 ? assignment.length : eq).trim();
    const expression = eq < 0 ? "" : assignment.slice(eq + 1).trim();
    if (eq < 0 || !/^[a-z_][a-z0-9_]*$/i.test(nameMatch)) {
      problems.push(`could not read an assignment out of "${assignment}"`);
      continue;
    }
    const column = nameMatch.toLowerCase();

    const identity = identityRe.exec(expression);
    if (identity) {
      const sourceColumn = (identity[1] ?? "").toLowerCase();
      const fallbackColumn = (identity[2] ?? "").toLowerCase();
      if (sourceColumn !== column || fallbackColumn !== column) {
        problems.push(
          `"${column}" is assigned from ${SOURCE_RECORD}.${sourceColumn} with fallback "${fallbackColumn}" — a cross-column copy this guard will not silently accept`,
        );
      }
      columns.push({ column, group: "identity", sourceColumn });
      continue;
    }

    const behavior = behaviorRe.exec(expression);
    if (behavior) {
      const sourceColumn = (behavior[1] ?? "").toLowerCase();
      if (sourceColumn !== column) {
        problems.push(
          `"${column}" is assigned from ${SOURCE_RECORD}.${sourceColumn} — a cross-column copy this guard will not silently accept`,
        );
      }
      columns.push({ column, group: "behavior", sourceColumn });
      continue;
    }

    if (!readsSource.test(expression) && !readsFlag.test(expression)) {
      // Bookkeeping — `updated_at = now()` and friends. Not a synced field.
      ignored.push(`${column} = ${expression}`);
      continue;
    }

    problems.push(
      `"${column} = ${expression}" reads the source row but matches neither the identity form ` +
        `(CASE WHEN ${IDENTITY_FLAG} THEN ${SOURCE_RECORD}.${column} ELSE ${column} END) ` +
        `nor the behavior form (${SOURCE_RECORD}.${column})`,
    );
  }

  return { columns, ignored, problems };
}

// ── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Diff the parsed DB truth against the TypeScript list. Every issue names the
 * column, what TS says, and what the DB says — never a vague "drift detected".
 */
export function diffSyncFields(
  parsed: readonly ParsedSyncColumn[],
  fields: readonly AgentSyncField[],
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.column)) {
      issues.push({
        column: f.column,
        detail: `listed TWICE in AGENT_SYNC_FIELDS — one column, one row`,
      });
    }
    seen.add(f.column);
  }

  const byColumnDb = new Map(parsed.map((p) => [p.column, p]));
  const byColumnTs = new Map(fields.map((f) => [f.column, f]));

  for (const dbCol of parsed) {
    const tsField = byColumnTs.get(dbCol.column);
    if (!tsField) {
      issues.push({
        column: dbCol.column,
        detail:
          `DB: the RPC's UPDATE writes it (${dbCol.group}) — TS: absent from AGENT_SYNC_FIELDS. ` +
          `Every comparison built from that list will call two agents identical while the sync overwrites this column.`,
      });
      continue;
    }
    if (tsField.group !== dbCol.group) {
      issues.push({
        column: dbCol.column,
        detail:
          `group mismatch — TS: "${tsField.group}" — DB: "${dbCol.group}" ` +
          `(${dbCol.group === "identity" ? `written only when p_include_identity is true` : `written unconditionally`}).`,
      });
    }
  }

  for (const tsField of fields) {
    if (byColumnDb.has(tsField.column)) continue;
    issues.push({
      column: tsField.column,
      detail:
        `TS: listed in AGENT_SYNC_FIELDS as "${tsField.group}" (label "${tsField.label}") — ` +
        `DB: the RPC's UPDATE never writes it. The UI promises a sync that does not happen.`,
    });
  }

  return issues;
}

// ── Snapshot IO ──────────────────────────────────────────────────────────────

export function readSnapshot(path: string = SNAPSHOT_PATH): SyncFunctionSnapshot {
  if (!existsSync(path)) {
    throw new Error(
      `snapshot missing: ${SNAPSHOT_REL}. Recreate it with \`pnpm check:sync-fields:refresh\`.`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SyncFunctionSnapshot>;
  if (typeof parsed.definition !== "string" || parsed.definition.length === 0) {
    throw new Error(`snapshot ${SNAPSHOT_REL} has no "definition" text.`);
  }
  return {
    generated_at: parsed.generated_at ?? "unknown",
    project: parsed.project ?? "txzxabzwovsujtloxrus",
    schema: parsed.schema ?? FUNCTION_SCHEMA,
    function: parsed.function ?? FUNCTION_NAME,
    source: parsed.source ?? "unknown",
    definition: parsed.definition,
  };
}

/** Pull one `CREATE OR REPLACE FUNCTION ...` block out of a whole-schema dump. */
export function extractFunctionDefinition(
  dump: string,
  schema: string = FUNCTION_SCHEMA,
  fn: string = FUNCTION_NAME,
): string | null {
  const head = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escapeRegExp(`${schema}.${fn}`)}\\s*\\(`,
    "i",
  );
  const start = dump.search(head);
  if (start < 0) return null;
  const bodyTag = dump.indexOf("$function$", start);
  if (bodyTag < 0) return null;
  const end = dump.indexOf("$function$", bodyTag + "$function$".length);
  if (end < 0) return null;
  return dump.slice(start, end + "$function$".length) + "\n";
}

interface SupabaseEnv {
  readonly url: string;
  readonly key: string;
}

function loadSupabaseEnv(): SupabaseEnv | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && (m[1] === "NEXT_PUBLIC_SUPABASE_URL" || m[1] === "SUPABASE_URL")) url = v;
        if (
          !key &&
          (m[1] === "SUPABASE_SECRET_KEY" ||
            m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ||
            m[1] === "SUPABASE_PUBLISHABLE_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

const MCP_INSTRUCTIONS =
  `Refresh it by hand instead — as an agent, via the Supabase MCP (project txzxabzwovsujtloxrus):\n` +
  `  select pg_get_functiondef(p.oid)\n` +
  `  from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n` +
  `  where n.nspname = '${FUNCTION_SCHEMA}' and p.proname = '${FUNCTION_NAME}';\n` +
  `then write the result into ${SNAPSHOT_REL} as the "definition" string (and bump "generated_at").`;

async function refreshSnapshot(): Promise<number> {
  const env = loadSupabaseEnv();
  if (!env) {
    console.error(
      `[FAIL] --refresh: no Supabase URL/key in env or .env* files, so the live definition cannot be pulled.\n` +
        MCP_INSTRUCTIONS,
    );
    return 2;
  }
  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${ROUTINE_DUMP_RPC}`;
  let raw: string;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: JSON.stringify({ p_schema: FUNCTION_SCHEMA }),
    });
    if (!res.ok) {
      console.error(
        `[FAIL] --refresh: rpc/${ROUTINE_DUMP_RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}\n` +
          MCP_INSTRUCTIONS,
      );
      return 2;
    }
    raw = await res.text();
  } catch (err) {
    console.error(
      `[FAIL] --refresh: could not reach Supabase (${err instanceof Error ? err.message : String(err)}).\n` +
        MCP_INSTRUCTIONS,
    );
    return 2;
  }

  let dump = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") dump = parsed;
  } catch {
    // PostgREST returned bare text — use it as-is.
  }

  const definition = extractFunctionDefinition(dump);
  if (!definition) {
    console.error(
      `[FAIL] --refresh: ${FUNCTION_SCHEMA}.${FUNCTION_NAME} was not in the routine dump — the function may have been dropped or renamed.\n` +
        MCP_INSTRUCTIONS,
    );
    return 2;
  }

  const payload: SyncFunctionSnapshot & { _comment: string } = {
    _comment:
      `LIVE definition of ${FUNCTION_SCHEMA}.${FUNCTION_NAME}(...) — the TRUTH that \`pnpm check:sync-fields\` parses and diffs against ` +
      `AGENT_SYNC_FIELDS in features/agents/sync/sync-fields.ts. AUTOGENERATED by \`pnpm check:sync-fields:refresh\` ` +
      `(PostgREST rpc/${ROUTINE_DUMP_RPC}) or by an agent via the Supabase MCP. Do NOT hand-edit — refresh it.`,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    project: "txzxabzwovsujtloxrus",
    schema: FUNCTION_SCHEMA,
    function: FUNCTION_NAME,
    source: `rpc/${ROUTINE_DUMP_RPC} (pg_get_functiondef)`,
    definition,
  };
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[OK] snapshot refreshed -> ${SNAPSHOT_REL} (${definition.length} chars)`);
  return 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const isTTY = process.stdout.isTTY && process.env.NO_COLOR !== "1";
  const RED = isTTY ? "\x1b[1;91m" : "";
  const RED_BG = isTTY ? "\x1b[1;97;41m" : "";
  const GREEN = isTTY ? "\x1b[1;92m" : "";
  const DIM = isTTY ? "\x1b[2m" : "";
  const RESET = isTTY ? "\x1b[0m" : "";

  if (process.argv.includes("--refresh")) {
    const code = await refreshSnapshot();
    if (code !== 0) return code;
  }

  console.log(
    `Agent-sync field check — AGENT_SYNC_FIELDS vs ${FUNCTION_SCHEMA}.${FUNCTION_NAME}()`,
  );

  let snapshot: SyncFunctionSnapshot;
  try {
    snapshot = readSnapshot();
  } catch (err) {
    console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
    console.error(MCP_INSTRUCTIONS);
    return 2;
  }

  const parsed = parseSyncSetClause(snapshot.definition);
  const issues = diffSyncFields(parsed.columns, AGENT_SYNC_FIELDS);
  const identityCount = parsed.columns.filter((c) => c.group === "identity").length;

  console.log(
    `  snapshot: ${SNAPSHOT_REL} ${DIM}(captured ${snapshot.generated_at}, via ${snapshot.source})${RESET}`,
  );
  console.log(
    `  DB SET clause: ${parsed.columns.length} synced column(s) ` +
      `${DIM}(${identityCount} identity, ${parsed.columns.length - identityCount} behavior; ` +
      `${parsed.ignored.length} bookkeeping ignored: ${parsed.ignored.join(", ") || "none"})${RESET}`,
  );
  console.log(`  TS AGENT_SYNC_FIELDS: ${AGENT_SYNC_FIELDS.length} column(s)`);
  console.log("");

  if (parsed.problems.length === 0 && issues.length === 0) {
    console.log(
      `${GREEN}OK — AGENT_SYNC_FIELDS matches every column the RPC writes, group for group.${RESET}`,
    );
    console.log(
      `${DIM}Snapshot is offline truth. Re-pull it with \`pnpm check:sync-fields:refresh\` after any change to the function.${RESET}`,
    );
    return 0;
  }

  const bar = "=".repeat(72);
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log(
    `${RED}AGENT-SYNC FIELD DRIFT — ${issues.length} contradiction(s), ${parsed.problems.length} parse problem(s).${RESET}`,
  );
  console.log(`${RED_BG}${bar}${RESET}`);
  console.log("");

  for (const p of parsed.problems) {
    console.log(`  ${RED}!${RESET} parser: ${DIM}${p}${RESET}`);
  }
  if (parsed.problems.length > 0) console.log("");

  for (const i of issues) {
    console.log(`  ${RED}x${RESET} ${i.column}: ${DIM}${i.detail}${RESET}`);
  }
  console.log("");
  console.log(
    `${DIM}Fix: make features/agents/sync/sync-fields.ts describe the sync EXACTLY as the RPC performs it ` +
      `(or change the RPC and refresh this snapshot in the same change). The snapshot may also be stale — ` +
      `run \`pnpm check:sync-fields:refresh\` before assuming the code is wrong.${RESET}`,
  );

  // Advisory by default; only --strict blocks.
  return strict ? 1 : 0;
}

// Run only when invoked as a CLI — importing this module (jest) must not execute.
if (/check-agent-sync-fields\.ts$/.test(process.argv[1] ?? "")) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error("check-agent-sync-fields: unexpected error");
      console.error(err);
      process.exit(2);
    });
}
