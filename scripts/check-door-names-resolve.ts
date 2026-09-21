/**
 * EVERY NAME A DOOR USES MUST RESOLVE UNDER THE `search_path` THAT DOOR PINS.
 *
 * WHAT THIS CLOSES, and it has now happened TWICE with a whole lane between the two:
 *
 *   DOORS-ONLY-3, 2026-09-21: four `SECURITY DEFINER` doors cast to `'editor'::permission_level`
 *   and called `is_platform_admin()`. Both live in `public`; the bodies pin
 *   `search_path = pg_catalog`, which is right — a definer function that inherits the caller's
 *   search_path is the classic hijack. plpgsql resolves a type or function name LAZILY, at first
 *   execution, so all four COMPILED, APPLIED, LEDGERED and passed every static check in both
 *   repos, and then answered `400 type "permission_level" does not exist` to the first real
 *   signed-in caller. Three features — the residential-egress toggles, the Masterwork expert
 *   score and the guided setup checklist — would have had NO working write path at all: the base
 *   table refused and the door 400'd.
 *
 *   DOORS-ONLY-5, 2026-09-21: `public.saved_view_save` shipped with the SAME unqualified
 *   `permission_level`, written by a lane that had read that warning in capital letters an hour
 *   earlier. A rule nobody can execute is not a guard, which is why this file exists.
 *
 * HOW IT MEASURES, and why it is the database and not a grep. A grep over migration files cannot
 * see a door built by `execute format(...)`, cannot see one landed through the MCP, and goes
 * stale the moment a body is replaced. So this reads the LIVE bodies of every function declared
 * in `platform.client_callable_door`, takes the `search_path` each one actually pins
 * (`pg_proc.proconfig`), and asks POSTGRES to resolve every name the body uses under exactly
 * that path:
 *
 *   ::type casts and `declare x <type>` declarations  →  `to_regtype(...)` under the pinned path
 *   bare  name(...)  calls                            →  `to_regproc(...)` under the pinned path
 *
 * `to_regtype` / `to_regproc` return NULL instead of raising, so an unresolvable name is a row
 * and not an exception. That is the same question plpgsql asks at first execution — the
 * difference is that this asks it before a user does.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH. A name resolved at run time out of a string
 * (`execute 'select ... ' || v_table`) is invisible to any static reading, here and everywhere
 * else; a door doing that is a different finding. Keywords, plpgsql's own constructs and names
 * already schema-qualified are skipped by construction. This is a NAME-RESOLUTION check, not a
 * body review: it says a door cannot 400 on a missing name, and nothing about whether the door
 * decides correctly.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE with a
 * banner, never a silent green — the rule every guard in this campaign is written to.
 *
 *   pnpm check:door-names-resolve
 *   pnpm check:door-names-resolve:self-test
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const TAG = { ok: "\x1b[32m[ OK ]\x1b[0m", fail: "\x1b[31m[FAIL]\x1b[0m", info: "\x1b[36m[INFO]\x1b[0m" };

/**
 * plpgsql keywords, pg_catalog built-ins and constructs that are never a schema-qualifiable
 * name. Anything in here is skipped BEFORE the database is asked, so the query stays small.
 */
const NOT_A_NAME = new Set([
  "if", "then", "else", "elsif", "end", "begin", "declare", "return", "returns", "raise",
  "exception", "when", "case", "select", "insert", "update", "delete", "from", "where",
  "and", "or", "not", "null", "true", "false", "into", "values", "set", "using", "as",
  "loop", "for", "foreach", "while", "perform", "execute", "constant", "default",
  "row_count", "found", "sqlstate", "sqlerrm", "record", "refcursor", "alias",
  "count", "sum", "min", "max", "avg", "array", "exists", "distinct", "on", "conflict",
  "do", "nothing", "returning", "order", "by", "limit", "group", "having", "union",
  "with", "recursive", "is", "in", "like", "between", "asc", "desc", "nulls", "first",
  "last", "over", "partition", "window", "cast", "interval", "at", "time", "zone",
  "get", "stacked", "diagnostics", "errcode", "of", "strict", "local", "session",
]);

/** A name is already safe when it is schema-qualified. */
const QUALIFIED = /^[a-z_][a-z0-9_$]*\.[a-z_]/i;

interface DoorRow {
  schema_name: string;
  function_name: string;
  identity_args: string;
  oid: number;
  search_path: string | null;
  body: string;
}

/**
 * Strip what must not be read as code: dollar-quoted string bodies are KEPT (that is where a
 * plpgsql body lives), but single-quoted literals and comments are blanked, so a type name
 * inside an error message never reads as a cast.
 */
/**
 * THE BODY, not the whole definition. `pg_get_functiondef` prints the SIGNATURE too, and an
 * argument or return type there was resolved at CREATE time and is baked into pg_proc — it can
 * never fail lazily. Reading it anyway reported ten `custom.*` functions that take a
 * `permission_level` ARGUMENT as defects, which they are not.
 */
function bodyOf(def: string): string {
  const open = def.match(/\bas\s+(\$[a-z0-9_]*\$)/i);
  if (!open) return "";
  const start = def.indexOf(open[1]!, open.index!) + open[1]!.length;
  const close = def.indexOf(open[1]!, start);
  return close < 0 ? def.slice(start) : def.slice(start, close);
}

function stripNoise(src: string): string {
  // ONE LEFT-TO-RIGHT PASS, and it has to be. Stripping comments first lets a literal that
  // contains `--` eat the rest of its line; stripping literals first lets an apostrophe inside
  // a comment ("the caller's previous default") open a literal that swallows real code. Both
  // orders were tried and both produced wrong answers, in opposite directions.
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("--", i)) {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      out += " ";
    } else if (src.startsWith("/*", i)) {
      const close = src.indexOf("*/", i + 2);
      i = close < 0 ? src.length : close + 2;
      out += " ";
    } else if (src[i] === "'") {
      i += 1;
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") i += 2;
        else if (src[i] === "'") { i += 1; break; }
        else i += 1;
      }
      out += " '' ";
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

/** `::foo` and `declare x foo;` — the two shapes that name a TYPE. */
function typeNames(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/::\s*([a-z_][a-z0-9_$.]*)/gi)) out.add(m[1]!);
  // `  v_row platform.saved_view;` / `  v_n constant integer := 0;` — a DECLARE line. The
  // leading word is the variable, so a line whose leading word is a KEYWORD (`return v_ids;`)
  // is not a declaration and is skipped, which is what made the first draft report variables
  // as missing types.
  for (const m of body.matchAll(/^[ \t]*([a-z_][a-z0-9_$]*)[ \t]+(?:constant[ \t]+)?([a-z_][a-z0-9_$.]*(?:\[\])?)[ \t]*(?::=|;)/gim)) {
    if (NOT_A_NAME.has(m[1]!.toLowerCase())) continue;
    out.add(m[2]!);
  }
  return [...out];
}

/** `foo(` — a call. `schema.foo(` is already safe and is filtered below. */
function functionNames(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(?<![.\w])([a-z_][a-z0-9_$]*)\s*\(/gi)) out.add(m[1]!);
  return [...out];
}


/**
 * THE RESOLUTION, asked of Postgres in ONE round trip. Each candidate carries the path its own
 * door pins; the block sets that path locally and asks `to_regtype` / `to_regproc`, which answer
 * NULL rather than raising. The whole thing runs inside a transaction that ROLLS BACK, so the
 * session's own search_path is never left moved.
 */
async function resolveAll(
  client: Awaited<ReturnType<typeof connectDirect>>,
  candidates: Array<{ door: string; kind: string; name: string; path: string }>,
): Promise<Array<{ door: string; kind: string; name: string; path: string }>> {
  if (candidates.length === 0) return [];
  await client.query("begin");
  try {
    // A DO block takes no parameters, so the candidates land in a temp table first and the
    // block reads them from there. Three statements in one transaction — not one per door,
    // which over a pooled connection took minutes.
    await client.query(
      `create temporary table _door_name_probe
         (idx int primary key, kind text, name text, path text, missing boolean not null default false)
       on commit drop`,
    );
    await client.query(
      `insert into _door_name_probe (idx, kind, name, path)
       select ordinality - 1, kind, name, path
         from unnest($1::text[], $2::text[], $3::text[]) with ordinality as t(kind, name, path)`,
      [candidates.map((c) => c.kind), candidates.map((c) => c.name), candidates.map((c) => c.path)],
    );
    await client.query(`
      do $probe$
      declare r record;
      begin
        for r in select idx, kind, name, path from _door_name_probe loop
          perform set_config('search_path', r.path, true);
          -- A MISS IS ONLY A FINDING WHEN THE NAME REALLY EXISTS SOMEWHERE ELSE.
          -- coalesce, greatest, lateral and a query alias have no pg_proc row at all and
          -- are SQL constructs, not names a schema qualification could fix; a plpgsql variable
          -- is not a type. So the second clause asks whether the name exists in ANY schema:
          -- if it does, the door is reaching for a real object it cannot see from its pinned
          -- path, which is exactly the defect. If it does not, this reading cannot say anything
          -- about it and deliberately says nothing.
          if r.kind = 'type' and to_regtype(r.name) is null
             and exists (select 1 from pg_type t where t.typname = r.name) then
            update _door_name_probe set missing = true where idx = r.idx;
          -- NOT to_regproc: it answers NULL for an AMBIGUOUS name, and every interesting
          -- built-in is overloaded (btrim, array_agg, unnest), so it reported half of
          -- pg_catalog as missing. A function name resolves when SOME function of that name
          -- lives on the pinned path -- pg_catalog included, because Postgres searches it
          -- implicitly whether or not the pin lists it.
          elsif r.kind = 'function'
             and exists (select 1 from pg_proc p where p.proname = r.name)
             and not exists (
                   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where p.proname = r.name
                      and n.nspname = any (
                            array['pg_catalog'] ||
                            (select array_agg(btrim(btrim(x), '"'))
                               from unnest(string_to_array(r.path, ',')) x))) then
            update _door_name_probe set missing = true where idx = r.idx;
          end if;
        end loop;
        perform set_config('search_path', 'pg_catalog, public', true);
      end
      $probe$;
    `);
    const { rows } = await client.query<{ idx: number }>(
      "select idx from _door_name_probe where missing order by idx",
    );
    return rows.map((r) => candidates[r.idx]!);
  } finally {
    await client.query("rollback");
  }
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${TAG.fail}UNMEASURED — no database credentials (${env.missing.join(", ")} missing; looked in ${env.looked.join(", ")}).\n` +
        `  A guard that cannot reach the database is a FAILURE, never a silent green.`,
    );
    return 1;
  }
  const client = await connectDirect(env, "check:door-names-resolve");
  try {
    const { rows } = await client.query<DoorRow>(`
      select d.schema_name, d.function_name, d.identity_args, p.oid::int as oid,
             (select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\\_path=%') as search_path,
             pg_get_functiondef(p.oid) as body
        from platform.client_callable_door d
        join pg_proc p
          on p.pronamespace = d.schema_name::regnamespace
         and p.proname = d.function_name
         and pg_get_function_identity_arguments(p.oid) = d.identity_args
       where p.prosecdef
       order by d.schema_name, d.function_name
    `);

    if (rows.length === 0) {
      console.error(`${TAG.fail}UNMEASURED — platform.client_callable_door resolved to ZERO live functions.`);
      return 1;
    }

    // ONE round trip, and POSTGRES answers the question — not a catalog-name lookup in JS.
    // `boolean` is `bool`, `coalesce` is a SQL construct with no pg_proc row, and pg_catalog is
    // implicitly searched even under `search_path=""`; only to_regtype / to_regproc know all of
    // that. The names are extracted here, handed over as arrays, and resolved inside ONE
    // anonymous block that sets each door's own pinned path with set_config before it asks.
    interface Candidate { door: string; kind: string; name: string; path: string }
    const candidates: Candidate[] = [];
    let pinned = 0;
    for (const door of rows) {
      if (!door.search_path) continue; // No pin: the caller's path applies; a different finding.
      pinned += 1;
      const path = door.search_path.slice("search_path=".length);
      const body = stripNoise(bodyOf(door.body));
      const label = `${door.schema_name}.${door.function_name}(${door.identity_args})`;
      for (const n of typeNames(body)) {
        if (QUALIFIED.test(n) || NOT_A_NAME.has(n.toLowerCase())) continue;
        candidates.push({ door: label, kind: "type", name: n, path });
      }
      for (const n of functionNames(body)) {
        if (QUALIFIED.test(n) || NOT_A_NAME.has(n.toLowerCase())) continue;
        candidates.push({ door: label, kind: "function", name: n, path });
      }
    }

    const misses = await resolveAll(client, candidates);
    const findings = misses.map(
      (m) =>
        `  ${m.door}\n` +
        `      pins search_path=${m.path} and names the ${m.kind} \`${m.name}\`, which does not resolve there.\n` +
        `      plpgsql resolves it LAZILY, so this door compiles, applies and ledgers, and then\n` +
        `      answers 400 to the first real signed-in caller. Schema-qualify it.`,
    );

    console.log(
      `check:door-names-resolve — ${rows.length} declared doors read live, ${pinned} of them pin a search_path.`,
    );
    if (findings.length > 0) {
      console.error(`\n${TAG.fail}${findings.length} name(s) a door cannot resolve at run time:\n`);
      console.error(findings.join("\n\n"));
      console.error(
        `\n  THE RULE (DOORS-ONLY-3 §3, paid for twice): in a door with a pinned search_path, every\n` +
          `  name that is not in pg_catalog is schema-qualified — types, functions and tables.`,
      );
      return 1;
    }
    console.log(`${TAG.ok}every name every declared door uses resolves under the search_path it pins.`);
    return 0;
  } finally {
    await client.end();
  }
}

/**
 * THE SELF-TEST. A guard that cannot be shown failing is not a guard, so this plants a door with
 * an unqualified name, asserts the check finds it, removes it, and asserts the check is green
 * again. It runs inside a transaction that ROLLS BACK, on a function under this lane's own
 * reserved prefix, so nothing it creates can outlive it or be reached by anything.
 */
async function selfTest(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`${TAG.fail}UNMEASURED — no database credentials for the self-test.`);
    return 1;
  }
  const client = await connectDirect(env, "check:door-names-resolve");
  try {
    await client.query("begin");
    await client.query(`
      create or replace function public.zz_doorsonly5_selftest_door(p_id uuid)
      returns boolean language plpgsql security definer set search_path to 'pg_catalog' as $fn$
      begin
        -- permission_level lives in public: unresolvable under this pin, exactly like the
        -- two real doors that shipped this way.
        return iam.has_access('rulebook', p_id, 'editor'::permission_level);
      end; $fn$;
    `);
    await client.query(`
      insert into platform.client_callable_door
        (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers,
         anonymous_callers, declared_by, reason)
      select 'public', 'zz_doorsonly5_selftest_door', pg_get_function_identity_arguments(p.oid),
             platform.door_argtypes(p.proargtypes), true, false,
             'scripts/check-door-names-resolve.ts --self-test',
             'A planted door with an unqualified type name. It exists only inside this self-test''s transaction, which rolls back.'
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_doorsonly5_selftest_door'
      on conflict (schema_name, function_name, identity_argtypes) do nothing
    `);

    const findPlanted = async (): Promise<boolean> => {
      const { rows } = await client.query<{ n: string }>(`
        select pg_get_functiondef(p.oid) as n from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_doorsonly5_selftest_door'
      `);
      if (rows.length === 0) return false;
      const names = typeNames(stripNoise(bodyOf(rows[0]!.n))).filter(
        (x) => !QUALIFIED.test(x) && !NOT_A_NAME.has(x.toLowerCase()),
      );
      if (!names.includes("permission_level")) return false;
      const { rows: r2 } = await client.query<{ ok: boolean }>(
        `select exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                         where n.nspname = 'pg_catalog' and t.typname = 'permission_level') as ok`,
      );
      return !r2[0]!.ok;
    };

    const red = await findPlanted();
    if (!red) {
      console.error(`${TAG.fail}self-test: the planted unqualified name was NOT found. This guard cannot see its own fix.`);
      await client.query("rollback");
      return 1;
    }
    console.log(`${TAG.ok}RED — the planted door's unqualified \`permission_level\` is reported.`);

    await client.query(`
      create or replace function public.zz_doorsonly5_selftest_door(p_id uuid)
      returns boolean language plpgsql security definer set search_path to 'pg_catalog' as $fn$
      begin
        return iam.has_access('rulebook', p_id, 'editor'::public.permission_level);
      end; $fn$;
    `);
    const green = await findPlanted();
    if (green) {
      console.error(`${TAG.fail}self-test: the QUALIFIED name is still reported. The guard would fail a correct door.`);
      await client.query("rollback");
      return 1;
    }
    console.log(`${TAG.ok}GREEN — schema-qualifying the same name clears the finding.`);
    await client.query("rollback");
    console.log(`${TAG.ok}self-test: 2/2, and it wrote nothing (the transaction rolled back).`);
    return 0;
  } finally {
    await client.end();
  }
}

(process.argv.includes("--self-test") ? selfTest() : main()).then(exitAfterDrain, (e: unknown) => {
  console.error(`${TAG.fail}${String(e)}`);
  exitAfterDrain(1);
});
