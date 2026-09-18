/**
 * `pnpm db:capture-go-signal` — RULE 30'S GO-SIGNAL CAPTURE, AND ITS PRODUCER.
 *
 * 🚨 ATTACK-6 finding 6. Rule 30 says every OFF-path diff runs against "the go signal's
 * SQL capture" rather than against a moving `origin/main` — both repos take ~400 commits
 * a day, and a `git diff` cannot compare a database function body at all. `V8-PROD` fact
 * ④, §6.9 item 9, §6b.4 and the OFF-path clause in `W1-ORG`, `W1-REG`, `W1-REL`,
 * `W2-VIS`, `W2-PRED` and `W2-ACCESS` all rest on that capture. It had **no producer, no
 * format and no enumerable object list**: §6.6's ten rows are knobs with prose object
 * descriptions, two of which name no SQL object at all. A mechanism named everywhere and
 * existing nowhere is exactly the shape ATTACK-5 finding 5 was raised against.
 *
 * This is the producer, and `OBJECTS` below is the enumerable list §6.6 was missing —
 * SQL identifiers beside the prose, one entry per knob.
 *
 * WHAT IT DOES
 *   --capture    read PRODUCTION (SELECT-only) and write one row per object into
 *                `campaign_watch.go_signal_capture` on the REHEARSAL BRANCH. No
 *                production write of any kind. This is a CHAIR step (§7.12), run once at
 *                the go signal.
 *   --list       print what the latest capture holds, with its run id and its clock.
 *   --read <id>  print one object's captured definition — what a lane diffs against.
 *   --diff       re-read production NOW and diff it against the latest capture, object by
 *                object. This is the OFF-path check every guarded lane's exit owes: it
 *                returns non-zero when anything outside `custom` has moved.
 *
 * WHAT A DEFINITION IS — the format the book did not state:
 *   function   every overload's `pg_get_functiondef`, ordered by argument types
 *   table      an ordered column list (name, type, nullability, default), then every
 *              `pg_get_constraintdef`, then every policy's qual/with-check, then every
 *              `pg_get_triggerdef` — because "the old path answers identically" is a claim
 *              about all four
 *   trigger    `pg_get_triggerdef`
 *   knob       `platform.knob_resolve(feature, key, null)`'s value, as text
 *
 * A definition this script cannot read is written as an explicit `-- ABSENT` marker with
 * the reason, never skipped: an object that disappears between the go signal and the
 * switch must show up as a diff, not as a matching absence.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "../lib/direct-db";
import { loadBranchDbEnv, loadBranchRef } from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = { dim: "[2m", bold: "[1m", red: "[31m", green: "[32m", reset: "[0m" };
const OK = `${C.green}✓${C.reset} `;
const FAIL = `${C.red}✗${C.reset} `;
const INFO = `${C.dim}·${C.reset} `;

type Kind = "function" | "table" | "trigger" | "knob";

interface CaptureTarget {
  /** The §6.6 knob this object is held OFF by. */
  readonly knob: string;
  readonly kind: Kind;
  /** The SQL identifier. For `knob`, `<feature>/<key>`. */
  readonly id: string;
}

/**
 * §6.6's ten rows, as SQL IDENTIFIERS. This list is the thing the book owed and did not
 * have; the prose descriptions stay where they are and this is what a machine reads.
 */
export const OBJECTS: readonly CaptureTarget[] = [
  // custom/system_enabled — the product switch itself. No DDL object; its VALUE is the fact.
  { knob: "custom/system_enabled", kind: "knob", id: "custom/system_enabled" },
  // custom/code_paths_enabled — the CODE half. Same: the knob's value is the object.
  { knob: "custom/code_paths_enabled", kind: "knob", id: "custom/code_paths_enabled" },
  // custom/associations_guard
  { knob: "custom/associations_guard", kind: "table", id: "platform.associations" },
  { knob: "custom/associations_guard", kind: "function", id: "platform.validate_edge_payload" },
  { knob: "custom/associations_guard", kind: "function", id: "platform.trg_reachability_on_association" },
  // custom/entity_types_guard
  { knob: "custom/entity_types_guard", kind: "table", id: "platform.entity_types" },
  // custom/field_index_guard — a FUNCTION, not a table.
  { knob: "custom/field_index_guard", kind: "function", id: "platform.custom_field_index_expr" },
  // custom/accessible_entity_ids_guard — BOTH overloads; the `function` kind captures all.
  { knob: "custom/accessible_entity_ids_guard", kind: "function", id: "iam.accessible_entity_ids" },
  { knob: "custom/accessible_entity_ids_guard", kind: "function", id: "iam.has_access_for_base" },
  // custom/emergency_door_guard
  { knob: "custom/emergency_door_guard", kind: "table", id: "iam.emergency_door_request" },
  // custom/entity_custom_fields_guard — the one standard Entity table W1-STORE names.
  { knob: "custom/entity_custom_fields_guard", kind: "table", id: "crm.party" },
  // custom/signup_provisioning_guard — the trigger every signup runs.
  { knob: "custom/signup_provisioning_guard", kind: "function", id: "public._provision_new_user_personal_org" },
  { knob: "custom/signup_provisioning_guard", kind: "trigger", id: "auth.users:on_auth_user_created" },
  // custom/row_versions_guard
  { knob: "custom/row_versions_guard", kind: "table", id: "history.row_versions" },
];

const ABSENT = (why: string) => `-- ABSENT: ${why}`;

async function definitionOf(client: pg.Client, t: CaptureTarget): Promise<string> {
  if (t.kind === "knob") {
    const [feature, key] = t.id.split("/");
    const r = await client.query<{ v: string | null }>(
      "select platform.knob_resolve($1, $2, null)::text as v",
      [feature, key],
    );
    return r.rows[0]?.v === null || r.rows[0] === undefined
      ? ABSENT(`platform.knob_resolve('${feature}','${key}', null) returned null`)
      : `knob ${t.id} = ${r.rows[0]!.v}`;
  }
  if (t.kind === "function") {
    const [schema, name] = t.id.split(".");
    const r = await client.query<{ def: string; args: string }>(
      `select pg_get_functiondef(p.oid) as def, pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1 and p.proname = $2
        order by pg_get_function_identity_arguments(p.oid)`,
      [schema, name],
    );
    if (r.rows.length === 0) return ABSENT(`no function ${t.id} in pg_proc`);
    return r.rows.map((x) => `-- ${t.id}(${x.args})\n${x.def}`).join("\n\n");
  }
  if (t.kind === "trigger") {
    const [table, trigger] = t.id.split(":");
    const [schema, name] = table!.split(".");
    const r = await client.query<{ def: string }>(
      `select pg_get_triggerdef(tg.oid) as def
         from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = $2 and tg.tgname = $3 and not tg.tgisinternal`,
      [schema, name, trigger],
    );
    return r.rows[0]?.def ?? ABSENT(`no trigger ${trigger} on ${table}`);
  }
  // table
  const [schema, name] = t.id.split(".");
  const reg = await client.query<{ oid: string | null }>("select to_regclass($1)::oid::text as oid", [t.id]);
  if (!reg.rows[0]?.oid) return ABSENT(`to_regclass('${t.id}') is null`);
  const cols = await client.query<{ line: string }>(
    `select format('%s %s %s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                   case when a.attnotnull then 'NOT NULL' else 'NULL' end,
                   coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')) as line
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped
      order by a.attname`,
    [t.id],
  );
  const cons = await client.query<{ line: string }>(
    `select format('%s: %s', conname, pg_get_constraintdef(oid)) as line
       from pg_constraint where conrelid = to_regclass($1) order by conname`,
    [t.id],
  );
  const pol = await client.query<{ line: string }>(
    `select format('%s [%s] cmd=%s roles=%s USING %s WITH CHECK %s', polname,
                   case when polpermissive then 'permissive' else 'restrictive' end,
                   polcmd, coalesce(array_to_string(polroles::regrole[], ','), 'PUBLIC'),
                   coalesce(pg_get_expr(polqual, polrelid), '-'),
                   coalesce(pg_get_expr(polwithcheck, polrelid), '-')) as line
       from pg_policy where polrelid = to_regclass($1) order by polname`,
    [t.id],
  );
  const trg = await client.query<{ line: string }>(
    `select pg_get_triggerdef(oid) as line from pg_trigger
      where tgrelid = to_regclass($1) and not tgisinternal order by tgname`,
    [t.id],
  );
  const rls = await client.query<{ enabled: boolean; forced: boolean }>(
    "select relrowsecurity as enabled, relforcerowsecurity as forced from pg_class where oid = to_regclass($1)",
    [t.id],
  );
  return [
    `-- table ${schema}.${name}`,
    `-- rls: enabled=${rls.rows[0]?.enabled} forced=${rls.rows[0]?.forced}`,
    "-- columns",
    ...cols.rows.map((r) => `  ${r.line}`),
    "-- constraints",
    ...cons.rows.map((r) => `  ${r.line}`),
    "-- policies",
    ...pol.rows.map((r) => `  ${r.line}`),
    "-- triggers",
    ...trg.rows.map((r) => `  ${r.line}`),
  ].join("\n");
}

function client(env: { host: string; port: number; user: string; password: string; database: string }, name: string) {
  return new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: name });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const mode = argv.includes("--capture")
    ? "capture"
    : argv.includes("--diff")
      ? "diff"
      : argv.includes("--read")
        ? "read"
        : "list";

  const ref = loadBranchRef(ROOT);
  const branchEnv = loadBranchDbEnv(ROOT, ref);
  const branch = client(branchEnv, "capture-go-signal (branch)");
  await branch.connect();

  try {
    // Nothing fails silently: the capture's own table is a named prerequisite with a
    // named remedy, not a 42P01 stack trace at 3 a.m.
    const has = await branch.query<{ oid: string | null }>(
      "select to_regclass('campaign_watch.go_signal_capture')::oid::text as oid",
    );
    if (!has.rows[0]?.oid) {
      console.error(
        `${FAIL}campaign_watch.go_signal_capture does not exist on the branch ${ref.branchRef}.\n` +
          `  It is created by migrations/campaign/custom_campaign_go_signal_capture.sql, which\n` +
          `  reaches a database only through the plan's own command:\n` +
          `    pnpm db:apply migrations/campaign/custom_campaign_go_signal_capture.sql \\\n` +
          `      --source campaign --target branch --lane <lane>`,
      );
      return 1;
    }
    if (mode === "list" || mode === "read") {
      const latest = await branch.query<{ run_id: string; captured_at: string }>(
        `select run_id, max(captured_at)::text as captured_at from campaign_watch.go_signal_capture
          group by run_id order by 2 desc limit 1`,
      );
      const run = latest.rows[0];
      if (!run) {
        console.error(
          `${FAIL}campaign_watch.go_signal_capture is EMPTY on the branch — the go signal has not been captured.\n` +
            `  Rule 30: every OFF-path diff runs against that capture. The chair takes it once, before dispatch:\n` +
            `    pnpm db:capture-go-signal --capture`,
        );
        return 1;
      }
      if (mode === "list") {
        const rows = await branch.query<{ knob: string; object_kind: string; object_id: string; n: number }>(
          `select knob, object_kind, object_id, length(definition) as n
             from campaign_watch.go_signal_capture where run_id = $1 order by knob, object_id`,
          [run.run_id],
        );
        console.log(`${INFO}capture ${run.run_id} taken ${run.captured_at} — ${rows.rows.length} object(s)`);
        for (const r of rows.rows)
          console.log(`  ${r.knob.padEnd(38)} ${r.object_kind.padEnd(9)} ${r.object_id}  ${C.dim}${r.n}B${C.reset}`);
        return 0;
      }
      const want = argv[argv.indexOf("--read") + 1];
      const row = await branch.query<{ definition: string }>(
        "select definition from campaign_watch.go_signal_capture where run_id = $1 and object_id = $2",
        [run.run_id, want],
      );
      if (!row.rows[0]) {
        console.error(`${FAIL}capture ${run.run_id} holds no object ${want}. Run --list to see what it holds.`);
        return 1;
      }
      console.log(row.rows[0].definition);
      return 0;
    }

    // capture / diff both read PRODUCTION, SELECT-only.
    const prodEnv = loadDbEnv();
    if ("missing" in prodEnv) {
      console.error(`${FAIL}production is read-only here but still needs credentials: ${prodEnv.missing.join(", ")}`);
      return 2;
    }
    if (prodEnv.user === ref.poolerUser || prodEnv.host.includes(ref.branchRef)) {
      console.error(`${FAIL}SUPABASE_MATRIX_* points at the BRANCH, not production. Refusing: the capture would read its own target.`);
      return 1;
    }
    const prod = client(prodEnv, "capture-go-signal (production, read only)");
    await prod.connect();
    try {
      await prod.query("begin read only");
      const taken: Array<CaptureTarget & { definition: string }> = [];
      for (const t of OBJECTS) taken.push({ ...t, definition: await definitionOf(prod, t) });
      await prod.query("rollback");

      if (mode === "capture") {
        const runId = randomUUID();
        for (const t of taken) {
          await branch.query(
            `insert into campaign_watch.go_signal_capture
               (run_id, knob, object_kind, object_id, definition, source_db)
             values ($1, $2, $3, $4, $5, $6)`,
            [runId, t.knob, t.kind, t.id, t.definition, prodEnv.host],
          );
        }
        const absent = taken.filter((t) => t.definition.startsWith("-- ABSENT"));
        console.log(
          `${OK}go-signal capture ${C.bold}${runId}${C.reset} — ${taken.length} object(s) from ` +
            `${prodEnv.host}, written to campaign_watch.go_signal_capture on the branch ${ref.branchRef}.`,
        );
        if (absent.length)
          console.log(
            `${INFO}${absent.length} object(s) recorded as ABSENT (they will diff if they appear later): ` +
              absent.map((a) => a.id).join(", "),
          );
        console.log(`${INFO}every OFF-path diff in this campaign now runs against this run id (rule 30).`);
        return 0;
      }

      // diff
      const latest = await branch.query<{ run_id: string; captured_at: string }>(
        `select run_id, max(captured_at)::text as captured_at from campaign_watch.go_signal_capture
          group by run_id order by 2 desc limit 1`,
      );
      const run = latest.rows[0];
      if (!run) {
        console.error(`${FAIL}nothing to diff against: campaign_watch.go_signal_capture is empty. Run --capture first.`);
        return 1;
      }
      const stored = new Map<string, string>(
        (
          await branch.query<{ object_id: string; definition: string }>(
            "select object_id, definition from campaign_watch.go_signal_capture where run_id = $1",
            [run.run_id],
          )
        ).rows.map((r) => [r.object_id, r.definition]),
      );
      let moved = 0;
      for (const t of taken) {
        const before = stored.get(t.id);
        if (before === undefined) {
          console.error(`${FAIL}${t.id} is not in capture ${run.run_id} — the object list and the capture disagree.`);
          moved += 1;
          continue;
        }
        if (before === t.definition) {
          console.log(`${OK}${t.knob.padEnd(38)} ${t.id}`);
          continue;
        }
        moved += 1;
        console.error(`${FAIL}${t.id} has MOVED since the go signal (${run.captured_at}):`);
        const a = before.split("\n");
        const b = t.definition.split("\n");
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
          if (a[i] !== b[i]) {
            if (a[i] !== undefined) console.error(`    ${C.red}- ${a[i]}${C.reset}`);
            if (b[i] !== undefined) console.error(`    ${C.green}+ ${b[i]}${C.reset}`);
          }
        }
      }
      if (moved) {
        console.error(
          `${FAIL}${moved} of ${taken.length} §6.6 object(s) differ from the go-signal capture. ` +
            `"Everything else on production is byte-identical to the capture" (§6.9) is FALSE right now.`,
        );
        return 1;
      }
      console.log(`${OK}all ${taken.length} §6.6 objects are identical to the go-signal capture ${run.run_id}.`);
      return 0;
    } finally {
      await prod.end().catch(() => {});
    }
  } finally {
    await branch.end().catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:capture-go-signal — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);
