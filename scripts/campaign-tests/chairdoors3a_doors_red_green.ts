#!/usr/bin/env npx tsx
/**
 * CHAIR-DOORS-3A (b, c, d, e) — red on the bodies before each file, green on the bodies after (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairdoors3a_doors_red_green.ts
 *
 * Needs the four files live on the clone. ONE transaction, rolled back, in
 * Cedar Ridge Physical Therapy (admin@admin.com owns it, test@test.com is a member) and, for the moved pointer,
 * the real dropped reference on Castellano & Reyes. Each section runs twice: AFTER (the live bodies; every check
 * must hold) and BEFORE (the inverse's bodies put in place inside the transaction; the named checks must FAIL,
 * which is what proves the check can tell the two apart).
 *
 *   C  the add rung: a member adds a scope to a scope type's Table; adds a row to a Table that says
 *      members_add_rows; is still refused on an ordinary Table; never edits somebody else's row; a stranger is
 *      still refused; a Home that says kept_for = agent_output answers viewer, a plain Home editor.
 *   D  custom.table_kind_facts carries column_source, platform_keys and each field's field_kind; every key it
 *      answered before is byte-identical.
 *   E  a Confidential Table with maker_is_reader: its maker no longer opens a member's row, the member still
 *      opens her own; the maker cannot take the state off or move the Table back to Organization.
 *   B  custom.validate_values: a pointer at an archived record stands when its envelope names a source of kind
 *      `move`, in the validator alone and through the record trigger on the real dropped reference
 *      (5f7a90b5 team_members -> 726ac9e6); a person's new pointer at an archived record is still refused.
 * Exit 0 GREEN, 1 RED, 2 could not run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { testDbEnvFrom } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const INV = (name: string) => resolve(ROOT, "migrations/inverse", `${name}_down.sql`);
const F_B = "chairdoors3a_b_a_moved_pointer_at_an_archived_record_stands";
const F_C = "chairdoors3a_c_the_add_rung_is_read_off_the_table_and_the_home";
const F_D = "chairdoors3a_d_a_table_says_its_column_source_and_platform_keys";
const F_E = "chairdoors3a_e_a_confidential_tables_maker_can_be_only_a_reader";
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const TEST = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy
const CASTELLANO = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const HELD = "5f7a90b5-42ff-45e5-b6c7-5f1a70f37a81";
const NADIA = "726ac9e6-8430-4174-9fb2-72c41559172a";
const HOME_KERNEL = "11111111-0000-4000-8000-000000000005";

/** Every `CREATE [OR REPLACE] FUNCTION … $function$;` of a file, or one by name. */
function bodies(file: string, only?: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /CREATE (?:OR REPLACE )?FUNCTION ([a-z_.]+)\([\s\S]*?\$function\$;/g;
  for (let m = re.exec(text); m; m = re.exec(text)) if (!only || m[1] === only) out.push(m[0].replace(/^CREATE FUNCTION/, "CREATE OR REPLACE FUNCTION"));
  if (!out.length) throw new Error(`UNMEASURED: no ${only ?? "function"} body in ${file}`);
  return out;
}

type Answer = { ok: true; rows: Record<string, unknown>[] } | { ok: false; code: string; message: string };

async function main() {
  const env = testDbEnvFrom(ROOT);
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, database: env.database, port: 5432,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const who = await client.query(
    `select (select count(*) from cron.job where active)::int as jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as net,
            (select count(*) from public._schema_migrations where filename = any ($1::text[]))::int as files`,
    [[F_B, F_C, F_D, F_E].map((f) => `${f}.sql`)],
  );
  const { jobs, net, files } = who.rows[0];
  if (jobs !== 0 || net || /brsgrqvjdzwihsvnfqkf/.test(env.user)) {
    console.log(`REFUSED: ${env.user} is not the quarantined dev clone (cron ${jobs}, pg_net ${net}).`);
    process.exit(2);
  }
  if (files !== 4) {
    console.log(`UNMEASURED: ${files} of the 4 files are ledgered on the clone; apply them first.`);
    process.exit(2);
  }
  console.log(`# ${env.user} (${env.from})`);

  let n = 0;
  async function ask(uid: string | null, sql: string, params: unknown[] = []): Promise<Answer> {
    const sp = `s${++n}`;
    await client.query(`savepoint ${sp}`);
    try {
      if (uid) {
        await client.query(
          "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
          [uid],
        );
        await client.query("set local role authenticated");
      }
      const r = await client.query(sql, params);
      if (uid) await client.query("reset role");
      await client.query(`release savepoint ${sp}`);
      return { ok: true, rows: r.rows };
    } catch (e) {
      await client.query(`rollback to savepoint ${sp}`);
      const err = e as { code?: string; message?: string };
      return { ok: false, code: err.code ?? "?", message: err.message ?? String(e) };
    }
  }
  const must = (a: Answer, what: string): Record<string, unknown>[] => {
    if (!a.ok) throw new Error(`UNMEASURED: ${what}: ${a.code} ${a.message}`);
    return a.rows;
  };
  const say = (a: Answer) => (a.ok ? "allowed" : `refused ${a.code}`);

  let red = 0;
  const results: string[] = [];
  /** `holds` is what the check found; `want` is what the phase expects of it (AFTER: true; BEFORE: false). */
  const check = (phase: "AFTER" | "BEFORE", id: string, holds: boolean, detail: string, changes = true) => {
    const want = phase === "AFTER" ? true : !changes;
    const good = holds === want;
    if (!good) red++;
    const line = `${good ? "ok  " : "FAIL"} ${phase.padEnd(6)} ${id.padEnd(4)} ${detail}`;
    results.push(line);
    console.log(line);   // printed as it happens, so a lock timeout later still leaves the evidence
  };

  // E4/E5 run BEFORE the one transaction: the guard honours an approval recorded in the same transaction, so
  // a SECOND connection commits a Confidential Table with maker_is_reader (clone only, archived again below) and
  // a later transaction tries the change without the door.
  const fields = [{ name: "item", key: "item", label: "Item", type: "text" }, { name: "checked_on", key: "checked_on", label: "Checked on", type: "text" }];
  const later = await (async () => {
    // The approval the door recorded lives in THIS transaction and the guard honours an approval of the same
    // transaction, so the two "without the door" checks run on a SECOND connection: one committed transaction
    // makes the Table Confidential with maker_is_reader (clone only, archived again below), the next tries.
    const two = new pg.Client({ user: env.user, password: env.password, host: env.host, database: env.database, port: 5432, ssl: { rejectUnauthorized: false } });
    await two.connect();
    let off: Answer = { ok: false, code: "?", message: "not run" }, leave: Answer = off;
    let proofTable: string | null = null;
    try {
      await two.query("begin");
      await two.query("set local lock_timeout = '120s'");
      await two.query("set local statement_timeout = '900s'");
      console.log("# E4/E5: a second connection makes the proof table …");
      await two.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [ADMIN]);
      await two.query("set local role authenticated");
      const home = (await two.query("select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id", [ORG, HOME_KERNEL, JSON.stringify({ name: "Peer review (clone proof) Home" })])).rows[0].id as string;
      const made = await two.query("select custom.table_declare($1::uuid, $2::jsonb)::text as v", [ORG, JSON.stringify({
        name: "Peer review submissions (clone proof)", slug: "cd3a_peer_review_proof", fields, members_add_rows: true, parent_id: home,
        type: "entity", label_singular: "Peer review submission", label_plural: "Peer review submissions", display: "list", weight: "light",
        ordered: false, row_order: "manual", title_field: "item", retention_days: 365, agent_writable: true, default_sort: [{ field: "item", direction: "asc" }],
      })]);
      proofTable = made.rows[0].v as string;
      await two.query("reset role");
      await two.query("select custom.set_table_confidential_arman_explicitly_approved($1::uuid, null, $2, current_date, true)",
        [proofTable, "CLONE PROOF ONLY - not Arman's words: a clone-only table, archived by the same proof"]);
      await two.query("commit");
      const attempt = async (sql: string): Promise<Answer> => {
        try { await two.query("begin"); await two.query("set local lock_timeout = '120s'"); await two.query(sql, [ORG, proofTable]); await two.query("rollback"); return { ok: true, rows: [] }; }
        catch (e) { await two.query("rollback").catch(() => {}); const err = e as { code?: string; message?: string }; return { ok: false, code: err.code ?? "?", message: err.message ?? "" }; }
      };
      off = await attempt("update custom.record set data = data - 'maker_is_reader' where organization_id = $1::uuid and id = $2::uuid");
      leave = await attempt("update custom.record set data = data - 'maker_is_reader' - 'level' - 'readers' where organization_id = $1::uuid and id = $2::uuid");
    } finally {
      if (proofTable) {
        // The maker owns it again, then archives it through the Table's own door, as herself.
        await two.query("begin");
        await two.query("set local lock_timeout = '120s'");
        await two.query("select custom.set_table_confidential_arman_explicitly_approved($1::uuid, null, $2, current_date, false)", [proofTable, "CLONE PROOF ONLY - not Arman's words: the proof is over"]);
        await two.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [ADMIN]);
        await two.query("set local role authenticated");
        await two.query("select custom.table_archive($1::uuid, $2::uuid)", [ORG, proofTable]);
        await two.query("reset role");
        await two.query("commit");
      }
      await two.end();
    }
    //, !off.ok && off.code === "42501", `a later transaction taking maker_is_reader off without the door: ${say(off)}`, false);
    return { off, leave };
  })();

  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '900s'");
    console.log("# fixtures …");
    await client.query("set local lock_timeout = '120s'");

    // ── fixtures, made as admin through the store's own doors ──────────────────────────────────────────
    const scopeType = must(await ask(null,
      `select t.id::text as id from custom.record t
        where t.organization_id = $1::uuid and t.table_id = custom.table_kernel_id() and t.deleted_at is null
          and t.data ->> 'kept_for' = 'context' and t.created_by is distinct from $2::uuid
          and exists (select 1 from custom.record r where r.organization_id = t.organization_id and r.table_id = t.id
                       and r.deleted_at is null and r.created_by is distinct from $2::uuid)
        order by t.created_at limit 1`, [ORG, TEST]), "a scope type's Table")[0]?.id as string;
    if (!scopeType) throw new Error("UNMEASURED: Cedar Ridge Physical Therapy keeps no scope type with a scope");
    const othersScope = must(await ask(null,
      `select r.id::text as id from custom.record r where r.organization_id = $1::uuid and r.table_id = $2::uuid
          and r.deleted_at is null and r.created_by is distinct from $3::uuid order by r.created_at limit 1`,
      [ORG, scopeType, TEST]), "a scope somebody else made")[0].id as string;
    // The Table's whole declaration, as @ai-matrx/records' declareTable sends it (core/declareTable.ts tableSpecFor).
    const ensure = async (spec: Record<string, unknown>) =>
      ({ table_id: must(await ask(ADMIN, "select custom.table_declare($1::uuid, $2::jsonb)::text as v", [ORG, JSON.stringify({
        parent_id: must(await ask(ADMIN, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id", [ORG, HOME_KERNEL, JSON.stringify({ name: `${spec.name} Home` })]), "a Home")[0].id,
        type: "entity", label_singular: spec.name, label_plural: spec.name, display: "list", weight: "light", ordered: false,
        row_order: "manual", title_field: "item", retention_days: 365, agent_writable: true,
        default_sort: [{ field: "item", direction: "asc" }], ...spec,
      })]), `table_declare ${spec.name}`)[0].v as string });
    const ordinary = (await ensure({ name: "Treatment room equipment checks", slug: "cd3a_equipment_checks", fields })).table_id;
    const ownRows = (await ensure({ name: "Shift handover notes", slug: "cd3a_shift_handover_notes", fields, members_add_rows: true })).table_id;
    const reviews = (await ensure({ name: "Peer review submissions", slug: "cd3a_peer_review_submissions", fields, members_add_rows: true })).table_id;
    const adminsRow = must(await ask(ADMIN, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
      [ORG, ownRows, JSON.stringify({ item: "Ultrasound unit 2 left charging", checked_on: "2026-10-02" })]), "admin's handover note")[0].id as string;
    const outputsHome = must(await ask(ADMIN, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
      [ORG, HOME_KERNEL, JSON.stringify({ name: "Agent outputs", kept_for: "agent_output" })]), "an outputs Home")[0].id as string;
    const plainHome = must(await ask(ADMIN, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
      [ORG, HOME_KERNEL, JSON.stringify({ name: "Front desk" })]), "a plain Home")[0].id as string;
    const stranger = must(await ask(null,
      `select u.id::text as id from auth.users u
        where not exists (select 1 from iam.organization_member m where m.user_id = u.id and m.organization_id = $1::uuid)
          and not exists (select 1 from public.current_user_is_admin a where a.user_id = u.id and a.is_admin)
          and u.id not in ($2::uuid, $3::uuid) order by u.created_at limit 1`, [ORG, ADMIN, TEST]), "a stranger")[0].id as string;
    console.log(`# scope type ${scopeType.slice(0, 8)}, ordinary ${ordinary.slice(0, 8)}, members_add_rows ${ownRows.slice(0, 8)}, stranger ${stranger.slice(0, 8)}`);

    // ── C: the add rung ─────────────────────────────────────────────────────────────────────────────────
    const sectionC = async (phase: "AFTER" | "BEFORE") => {
      const scope = await ask(TEST, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
        [ORG, scopeType, JSON.stringify({ name: `Aquatic therapy ${phase.toLowerCase()}` })]);
      // Until the final switch, a scope type's Table is written only through lane 9's scope doors (the
      // custom._context_copy_fence trigger, AFTER the add rung is asked); so a member's direct write now
      // reaches the fence instead of being refused "needs the editor level" at the rung.
      const pastTheRung = scope.ok || (scope.code === "42501" && !/needs the editor level/.test(scope.message));
      const rung = must(await ask(null, "select custom.table_add_rung($1::uuid, $2::uuid)::text as r", [ORG, scopeType]), "the rung")[0].r;
      check(phase, "C1", pastTheRung && rung === "viewer", `a member adding a scope to a scope type's Table (rung ${rung}): ${say(scope)}${scope.ok ? "" : ` (${scope.message.slice(0, 60)}…)`}`);
      const edit = await ask(TEST, "select custom.record_update($1::uuid, $2::uuid, $3::jsonb, null)", [ORG, othersScope, JSON.stringify({ name: "Renamed by a member" })]);
      check(phase, "C2", !edit.ok && edit.code === "42501", `a member editing somebody else's scope: ${say(edit)}`, false);
      if (scope.ok) {
        const own = await ask(TEST, "select custom.record_update($1::uuid, $2::uuid, $3::jsonb, null)", [ORG, scope.rows[0].id, JSON.stringify({ name: "Aquatic therapy (pool B)" })]);
        check(phase, "C3", own.ok, `a member editing the scope she just added: ${say(own)}`, false);
      }
      const row = await ask(TEST, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
        [ORG, ownRows, JSON.stringify({ item: "Traction table belt replaced", checked_on: "2026-10-03" })]);
      check(phase, "C4", row.ok, `a member adds a row to a Table that says members_add_rows: ${say(row)}`);
      const others = await ask(TEST, "select custom.record_update($1::uuid, $2::uuid, $3::jsonb, null)", [ORG, adminsRow, JSON.stringify({ item: "Changed by a member" })]);
      check(phase, "C5", !others.ok && others.code === "42501", `a member editing admin's row in that Table: ${say(others)}`, false);
      const plain = await ask(TEST, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
        [ORG, ordinary, JSON.stringify({ item: "Parallel bars inspected", checked_on: "2026-10-03" })]);
      check(phase, "C6", !plain.ok && plain.code === "42501", `a member adding to an ordinary Table: ${say(plain)}`, false);
      const out = await ask(stranger, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
        [ORG, scopeType, JSON.stringify({ name: "Added by a stranger" })]);
      check(phase, "C7", !out.ok && out.code === "42501", `a stranger adding a scope: ${say(out)}`, false);
      const rungs = must(await ask(null,
        "select custom.table_add_rung($1::uuid, $2::uuid)::text as outputs, custom.table_add_rung($1::uuid, $3::uuid)::text as plain, custom.table_add_rung($1::uuid, $4::uuid)::text as ordinary",
        [ORG, outputsHome, plainHome, ordinary]), "the rungs")[0];
      check(phase, "C8", rungs.outputs === "viewer", `an outputs Home asks the ${rungs.outputs} rung to land a Table in it`);
      check(phase, "C9", rungs.plain === "editor" && rungs.ordinary === "editor", `a plain Home asks ${rungs.plain}, an ordinary Table ${rungs.ordinary}`, false);
    };

    // ── D: the kind facts ───────────────────────────────────────────────────────────────────────────────
    let factsAfter: Record<string, unknown> | null = null;
    const sectionD = async (phase: "AFTER" | "BEFORE") => {
      const a = must(await ask(ADMIN, "select custom.table_kind_facts($1::uuid) as v", [ordinary]), "table_kind_facts")[0].v as Record<string, unknown>;
      const flds = (a.fields ?? []) as Record<string, unknown>[];
      check(phase, "D1", a.column_source === "fields", `column_source = ${JSON.stringify(a.column_source)}`);
      check(phase, "D2", JSON.stringify(a.platform_keys) === JSON.stringify(["parent_id"]), `platform_keys = ${JSON.stringify(a.platform_keys)}`);
      check(phase, "D3", flds.length > 0 && flds.every((f) => f.field_kind === "text"), `each field says its kind: ${JSON.stringify(flds.map((f) => f.field_kind))}`);
      const strip = (x: Record<string, unknown>) => {
        const { column_source: _c, platform_keys: _p, ...rest } = x;
        return JSON.stringify({ ...rest, fields: ((rest.fields ?? []) as Record<string, unknown>[]).map(({ field_kind: _k, ...f }) => f) });
      };
      if (phase === "AFTER") factsAfter = a;
      else check(phase, "D4", strip(a) === strip(factsAfter!), "every key answered before the file is byte-identical after it", false);
    };

    // ── E: the maker is only a reader ───────────────────────────────────────────────────────────────────
    const memberRow = must(await ask(TEST, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
      [ORG, reviews, JSON.stringify({ item: "Self review, third quarter", checked_on: "2026-10-03" })]), "the member's review row")[0].id as string;
    const sectionE = async (phase: "AFTER" | "BEFORE") => {
      await client.query("savepoint e");
      const door = phase === "AFTER"
        ? await ask(null, "select custom.set_table_confidential_arman_explicitly_approved($1::uuid, null, $2, current_date, true) as v",
            [reviews, "CLONE PROOF ONLY, rolled back - not Arman's words: peer review submissions are Confidential and the maker is only a reader"])
        : await ask(null, "select custom.set_table_confidential_arman_explicitly_approved($1::uuid, null, $2, current_date) as v",
            [reviews, "CLONE PROOF ONLY, rolled back - not Arman's words: peer review submissions are Confidential"]);
      must(door, "the Confidential door");
      if (phase === "AFTER") {
        const v = (door as { ok: true; rows: Record<string, unknown>[] }).rows[0].v as Record<string, unknown>;
        check(phase, "E0", v.maker_is_reader === true && v.level === "confidential", `the door answers level ${v.level}, maker_is_reader ${v.maker_is_reader}`, false);
      }
      const sees = must(await ask(null,
        "select custom.has_visibility($1::uuid, 'record', $3::uuid, 'viewer'::public.permission_level) as maker, custom.has_visibility($2::uuid, 'record', $3::uuid, 'viewer'::public.permission_level) as member",
        [ADMIN, TEST, memberRow]), "has_visibility")[0];
      check(phase, "E1", sees.maker === false, `the Table's maker ${sees.maker ? "opens" : "does not open"} the member's row`);
      check(phase, "E2", sees.member === true, `the member ${sees.member ? "opens" : "does not open"} her own row`, false);
      const read = await ask(ADMIN, "select (custom.read_record($1::uuid, $2::uuid, false)) is not null as got", [ORG, memberRow]);
      check(phase, "E3", !read.ok || read.rows.length === 0 || read.rows[0].got === false, `custom.read_record as the maker: ${read.ok ? (read.rows[0]?.got ? "answers the row" : "no row") : `refused ${read.code}`}`);
      if (phase === "AFTER") {
        check(phase, "E4", !later.off.ok && later.off.code === "42501", `a later transaction taking maker_is_reader off without the door: ${say(later.off)}`, false);
        check(phase, "E5", !later.leave.ok && later.leave.code === "42501", `a later transaction moving it back to Organization without the door: ${say(later.leave)}`, false);
        const stray = await ask(null, "update custom.record set data = data || '{\"maker_is_reader\": true}'::jsonb where organization_id = $1::uuid and id = $2::uuid", [ORG, ordinary]);
        check(phase, "E6", !stray.ok, `maker_is_reader on a Table that is not Confidential: ${say(stray)}`, false);
        const back = await ask(null, "select custom.set_table_confidential_arman_explicitly_approved($1::uuid, null, $2, current_date, false) as v",
          [reviews, "CLONE PROOF ONLY, rolled back - not Arman's words: the maker owns it again"]);
        const again = must(await ask(null, "select custom.has_visibility($1::uuid, 'record', $2::uuid, 'viewer'::public.permission_level) as maker", [ADMIN, memberRow]), "has_visibility")[0];
        check(phase, "E7", back.ok && again.maker === true, `the door turning it off: ${say(back)}; the maker then ${again.maker ? "opens" : "does not open"} the row`, false);
      }
      await client.query("rollback to savepoint e");
    };

    // ── B: the moved pointer ────────────────────────────────────────────────────────────────────────────
    const fld = must(await ask(null,
      `select array_agg(f)::text as fields, (array_agg(f.data ->> 'relation_target'))[1] as target
         from custom.record f
        where f.organization_id = $1::uuid and f.table_id = custom.field_kernel_id() and f.deleted_at is null
          and f.data ->> 'key' = 'team_members'
          and f.data ->> 'entity_definition_id' = (select r.table_id::text from custom.record r where r.id = $2::uuid)`,
      [CASTELLANO, HELD]), "the team_members field")[0];
    const live = must(await ask(null, "select (r.data -> 'team_members') as held, r.data -> '_values' -> 'team_members' ->> 'src' as src from custom.record r where r.id = $1::uuid", [HELD]), "the held row")[0];
    const wanted = JSON.stringify([...(live.held as string[]), NADIA]);
    const validate = (values: Record<string, unknown>) =>
      ask(null, "select custom.validate_values($1::uuid, $2::custom.record[], $3::jsonb, null)", [CASTELLANO, fld.fields, JSON.stringify(values)]);
    const sectionB = async (phase: "AFTER" | "BEFORE") => {
      const moved = await validate({ team_members: [NADIA], _values: { team_members: { src: "s1" } }, _sources: { s1: { kind: "move" } } });
      check(phase, "B1", moved.ok, `a moved pointer at an archived scope (source interned): ${say(moved)}`);
      const handed = await validate({ team_members: [NADIA], _values: { team_members: { src: { kind: "move" } } } });
      check(phase, "B2", handed.ok, `the same, the source still an object: ${say(handed)}`);
      const person = await validate({ team_members: [NADIA], _values: { team_members: { src: "s1" } }, _sources: { s1: { kind: "manual" } } });
      check(phase, "B3", !person.ok && person.code === "23514", `a person's new pointer at an archived scope: ${say(person)}`, false);
      const bare = await validate({ team_members: [NADIA] });
      check(phase, "B4", !bare.ok && bare.code === "23514", `a pointer at an archived scope with no envelope: ${say(bare)}`, false);
      const wrong = await validate({ team_members: [HELD], _values: { team_members: { src: "s1" } }, _sources: { s1: { kind: "move" } } });
      check(phase, "B5", !wrong.ok && wrong.code === "23514", `a moved pointer at a record of another table: ${say(wrong)}`, false);
      await client.query("savepoint b");
      const real = await ask(null,
        "update custom.record set data = jsonb_set(data, '{team_members}', $2::jsonb) where id = $1::uuid returning data -> 'team_members' as v", [HELD, wanted]);
      check(phase, "B6", real.ok && JSON.stringify(real.rows[0]?.v) === wanted,
        `the real dropped reference (source ${live.src}, kind move) written back through the record's own triggers: ${say(real)}${real.ok ? "" : ` (${real.message.slice(0, 80)})`}`);
      await client.query("rollback to savepoint b");
    };

    console.log("# AFTER …");
    // ── A: the count door keeps the "Only me" list rule (the nolist plant has no data to bite on in the
    //      organizations the count harness samples, so the row is planted here). Admin's archived "Only me"
    //      row: the member's count is 0 and the archive door shows her 0; admin's count is 1. With the count-only
    //      answer's list rule taken out (the plant), the member's count becomes 1 while the archive door still
    //      shows her 0.
    must(await ask(ADMIN, "select custom.table_row_defaults_set($1::uuid, $2::uuid, $3::jsonb)", [ORG, ownRows, JSON.stringify({ shown_to: "only_me" })]), "row defaults only_me");
    const privateRow = must(await ask(ADMIN, "select custom.record_write($1::uuid, $2::uuid, $3::jsonb)::text as id",
      [ORG, ownRows, JSON.stringify({ item: "Night shift: alarm panel reset", checked_on: "2026-10-02" })]), "admin's Only-me row")[0].id as string;
    must(await ask(ADMIN, "select custom.record_delete($1::uuid, $2::uuid)", [ORG, privateRow]), "archiving admin's row");
    const countOf = async (uid: string) => {
      const c = must(await ask(uid, "select coalesce((select n from custom.count_records_archived($1::uuid, array[$2::uuid], 'org')), -1)::int as n", [ORG, ownRows]), "count door")[0].n as number;
      const d = must(await ask(uid, "select count(*)::int as n from custom.read_records_archived($1::uuid, $2::uuid, 'org', false, 200, 0)", [ORG, ownRows]), "archive door")[0].n as number;
      return { c, d };
    };
    const asMember = await countOf(TEST), asAdmin = await countOf(ADMIN);
    check("AFTER", "A1", asMember.c === 0 && asMember.d === 0, `the member: count door ${asMember.c}, archive door ${asMember.d} (admin's Only-me archived row stays his)`);
    check("AFTER", "A2", asAdmin.c === 1 && asAdmin.d === 1, `admin: count door ${asAdmin.c}, archive door ${asAdmin.d}`, false);
    const upA = readFileSync(resolve(ROOT, "migrations/campaign/chairdoors3a_a_archived_rows_are_counted_in_one_call.sql"), "utf8");
    const archiveBody = (() => { const at = upA.indexOf("CREATE OR REPLACE FUNCTION custom.read_records_archived("); return upA.slice(at, upA.indexOf("$function$;", at) + 11); })();
    const noList = "|| format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',\n                v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),\n      case when v_lane = 'mine'";
    if (!archiveBody.includes(noList)) throw new Error("UNMEASURED: the nolist plant found nothing to change");
    await client.query(archiveBody.replace(noList, ",\n      case when v_lane = 'mine'"));
    const planted = await countOf(TEST);
    check("BEFORE", "A1", planted.c === 0 && planted.d === 0, `PLANT nolist — the member: count door ${planted.c}, archive door ${planted.d}`);
    await client.query(archiveBody);

    await sectionC("AFTER");
    await sectionD("AFTER");
    await sectionE("AFTER");
    await sectionB("AFTER");
    console.log("# BEFORE …");

    for (const b of bodies(INV(F_C))) await client.query(b);
    await sectionC("BEFORE");
    for (const b of bodies(INV(F_D))) await client.query(b);
    await sectionD("BEFORE");
    for (const name of ["custom.confidential_answer", "custom._table_shape_guard"]) for (const b of bodies(INV(F_E), name)) await client.query(b);
    await sectionE("BEFORE");
    for (const b of bodies(INV(F_B))) await client.query(b);
    await sectionB("BEFORE");
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
  console.log(red ? `RED (${red})` : "GREEN — every check holds on the live bodies, and every check the files change fails on the bodies before them");
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
