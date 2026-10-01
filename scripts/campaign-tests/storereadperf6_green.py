#!/usr/bin/env python3
"""
LANE STORE-READ-PERF-6 — ONE WALK FOR EVERY TABLE THE TREE NAMES: SAME ANSWERS (dev clone only).

  cd matrx-frontend && python3 scripts/campaign-tests/storereadperf6_green.py            # the file, live
  cd matrx-frontend && python3 scripts/campaign-tests/storereadperf6_green.py --plant all_v   # must go RED

The file's new code runs only in a transaction that has written NOTHING (its statement memos are fenced
that way), so this suite never writes: in ONE REPEATABLE READ transaction (one snapshot) it asks every
door twice — first with nothing written (the memos ON: the new one-pass paths), then after
pg_current_xact_id() has given the transaction an id (every statement memo OFF: each call takes the
bodies' old code, verbatim from before the file) — and compares the answers byte for byte:
  T  custom.context_tree(all her live organizations) and custom.context_tree(array[o]) for each of them;
  Q  custom.query_visible_ids(o, Table) for every (organization, Table) pair named at once — every live
     Table of her organizations for the two seats, every scope Table for everyone else;
  C  custom.read_door_carried_ids(person, o, Table, viewer) for the same named pairs (ids and count);
  K  custom.tables_listed_among(o, every live Table of o) with all her organizations named at once.
People: admin@admin.com, test@test.com and every live member of an organization that keeps a scope type.
Every door call is its own top-level statement (the memos are per statement).
--plant copy loads the file's bodies unplanted as pg_temp copies (the suite before the file is live).
--plant NAME loads the file's three bodies, with one fault planted, as pg_temp copies (with the
callers they need) on this session and runs the same suite against them; the planted fault lives only in
a one-pass path, so the plant must turn the comparison RED:
  all_v         the pair batch reads an all-visible Table as "only her own rows"          (T, Q)
  carried_none  the containment batch hands back no carried ids                           (C, and T/Q where carried)
  down_any      the containment batch keeps reached records of any named Table            (C)
  among_unseen  the batched among walk keeps every Table, seen or not                     (T, K)
Exit 0 GREEN, 1 RED, 2 could not run.
"""
import os, re, subprocess, sys, tempfile, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILE = os.path.join(ROOT, "migrations/campaign/storereadperf6_one_walk_for_every_table_the_tree_names.sql")
def _clone_ref() -> str:
    # the clone of tonight (rewritten by the nightly refresh): common-docs/operations/clone/CLONE-REF
    path = os.path.join(os.path.dirname(ROOT), "common-docs/operations/clone/CLONE-REF")
    for line in open(path):
        m = re.match(r"^\s*clone_ref\s*=\s*(\w+)", line)
        if m:
            return m.group(1)
    sys.exit("REFUSED: no clone_ref in " + path)

CLONE_REF = _clone_ref()
PSQL = os.environ.get("PSQL", "/opt/homebrew/opt/libpq/bin/psql")

def clone_url() -> str:
    for line in open(os.path.join(ROOT, ".env.local")):
        m = re.match(r"^\s*CLONE_DATABASE_URL\s*=\s*['\"]?(.*?)['\"]?\s*$", line)
        if m:
            url = m.group(1)
            if CLONE_REF not in url:
                sys.exit("REFUSED: CLONE_DATABASE_URL does not name the clone " + CLONE_REF)
            # the session pooler: pg_temp copies and the transaction must share one backend
            return url.replace(":6543/", ":5432/")
    sys.exit("REFUSED: no CLONE_DATABASE_URL in .env.local")

URL = clone_url()

def psql(script: str, timeout=3600) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(script)
        path = f.name
    try:
        r = subprocess.run([PSQL, URL, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-f", path],
                           capture_output=True, text=True, timeout=timeout)
    finally:
        os.unlink(path)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-4000:])
        sys.exit(2)
    return r.stdout

PLANTS = {
    # (function, old text, new text, which occurrence: 0-based)
    "all_v": ("query_visible_ids", "when s.all_v then true", "when s.all_v then r.created_by = v_user", 1),
    "carried_none": ("read_door_carried_ids",
                     "        o_ids := case when v_ids = '~' then null",
                     "        v_ids := case when v_ids = '~' then v_ids else '' end;\n        o_ids := case when v_ids = '~' then null", 0),
    "down_any": ("read_door_carried_ids",
                 "                                        and r.table_id is not distinct from c.tbl\n                                      where x.org = c.org",
                 "                                      where x.org = c.org", 0),
    "among_unseen": ("query_visible_ids",
                     "             where g.seen;\n            perform platform.memo_k_put(v_pk, v_m);",
                     "            ;\n            perform platform.memo_k_put(v_pk, v_m);", 0),
}

def main():
    plant = None
    if "--plant" in sys.argv:
        plant = sys.argv[sys.argv.index("--plant") + 1]
        if plant != "copy" and plant not in PLANTS:
            sys.exit(f"unknown plant {plant}; one of {', '.join(PLANTS)}")
    guard = psql("select current_user, (select count(*) from cron.job where active), "
                 "exists (select 1 from pg_extension where extname = 'pg_net');").strip().split("|")
    if guard[1] != "0" or guard[2] != "f":
        sys.exit(f"REFUSED: not the quarantined clone ({guard})")

    pre = ["\\set QUIET on", "set client_min_messages = warning;"]
    ns = "custom"
    names = ["context_tree", "query_visible_ids", "read_door_carried_ids", "visible_set", "tables_listed_among"]
    if plant:
        ns = "pg_temp"
        text = open(FILE).read()
        bodies = re.findall(r"(CREATE OR REPLACE FUNCTION custom\.(\w+)\(.*?\n\$function\$;)", text, re.S)
        got = {n: b for b, n in bodies}
        assert set(got) == {"context_tree", "query_visible_ids", "read_door_carried_ids"}, got.keys()
        if plant != "copy":
            fn, old, new, occ = PLANTS[plant]
            parts = got[fn].split(old)
            assert len(parts) > occ + 1, f"plant {plant} found nothing to change"
            got[fn] = old.join(parts[: occ + 1]) + new + old.join(parts[occ + 1:])
        for extra in ("visible_set", "tables_listed_among"):
            got[extra] = psql(f"select pg_get_functiondef('custom.{extra}'::regproc);").rstrip() + ";"
        for n in got:
            b = got[n]
            for m in names:
                b = b.replace(f"custom.{m}(", f"pg_temp.{m}(")
            pre.append(b)

    # The helpers: plpgsql, so each NAMES the pairs (or organizations) before it asks, in its one statement.
    pre.append(f"""
create function pg_temp.p6_pairs(p_user uuid, p_pairs text[]) returns setof text language plpgsql as $$
declare x text; r record; q text;
begin
  perform platform.memo_k_put('custom.qvi_pairs:' || p_user::text, array_to_string(p_pairs, ','));
  foreach x in array p_pairs loop
    r := {ns}.read_door_carried_ids(p_user, split_part(x, ':', 1)::uuid, split_part(x, ':', 2)::uuid, 'viewer');
    return next 'C|' || x || '|' || coalesce(r.o_containers::text, '-') || '|' || coalesce(array_to_string(r.o_ids, ','), 'NULL');
  end loop;
  foreach x in array p_pairs loop
    select string_agg(v::text, ',' order by v) into q
      from {ns}.query_visible_ids(split_part(x, ':', 1)::uuid, split_part(x, ':', 2)::uuid) v;
    return next 'Q|' || x || '|' || md5(coalesce(q, ''));
  end loop;
  perform platform.memo_k_drop('custom.qvi_pairs:' || p_user::text);
end $$;
create function pg_temp.p6_among(p_user uuid, p_orgs uuid[]) returns setof text language plpgsql as $$
declare o uuid; q text; m jsonb;
begin
  select coalesce(jsonb_object_agg(z.org, z.ids), '{{}}'::jsonb) into m
    from (select t.organization_id as org, jsonb_agg(t.id order by t.id) as ids from custom.record t
           where t.organization_id = any (p_orgs) and t.table_id = custom.table_kernel_id() and t.deleted_at is null
           group by 1) z;
  perform platform.memo_k_put('custom.kernel_among_batch:' || p_user::text, m::text);
  foreach o in array p_orgs loop
    select string_agg(v::text, ',' order by v) into q
      from {ns}.tables_listed_among(o, array(select jsonb_array_elements_text(coalesce(m -> o::text, '[]'::jsonb))::uuid)) v;
    return next 'K|' || o::text || '|' || md5(coalesce(q, ''));
  end loop;
  perform platform.memo_k_drop('custom.kernel_among_batch:' || p_user::text);
end $$;
""")
    people_sql = """
create temp table if not exists p6_people as
  select u.id, u.email,
         array(select m.organization_id from iam.organization_member m
                 join iam.organizations o on o.id = m.organization_id and o.archived_at is null
                where m.user_id = u.id order by 1) as orgs
    from auth.users u
   where u.email in ('admin@admin.com', 'test@test.com')
      or u.id in (select m.user_id from custom.record t
                    join iam.organization_member m on m.organization_id = t.organization_id
                    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
                   where t.table_id = custom.table_kernel_id() and t.deleted_at is null and t.data ->> 'kept_for' = 'context');
"""
    # the people list is worked out BEFORE the transaction (a temp table is a write)
    pre.append(people_sql)
    stmts = r"""
select z.s from (
  select p.email, 0 as k, format('select %L || ''|claims|'' || set_config(''request.jwt.claims'', %L, false);',
                                 p.email || '|' || :'phase', json_build_object('sub', p.id, 'role', 'authenticated')::text) as s
    from p6_people p
  union all
  select p.email, 1, format('select %L || ''|T|all|'' || md5(NS.context_tree(%L::uuid[])::text);', p.email || '|' || :'phase', p.orgs)
    from p6_people p
  union all
  select p.email, 2, format('select %L || ''|T|%s|'' || md5(NS.context_tree(array[%L]::uuid[])::text);', p.email || '|' || :'phase', o, o)
    from p6_people p cross join lateral unnest(p.orgs) o
  union all
  select p.email, 3, format('select %L || ''|'' || x from pg_temp.p6_pairs(%L, %L::text[]) x;', p.email || '|' || :'phase', p.id,
                            array(select t.organization_id::text || ':' || t.id::text from custom.record t
                                   where t.organization_id = any (p.orgs) and t.table_id = custom.table_kernel_id() and t.deleted_at is null
                                     and (p.email in ('admin@admin.com', 'test@test.com') or t.data ->> 'kept_for' = 'context')
                                   order by 1))
    from p6_people p
  union all
  select p.email, 4, format('select %L || ''|'' || x from pg_temp.p6_among(%L, %L::uuid[]) x;', p.email || '|' || :'phase', p.id, p.orgs)
    from p6_people p
) z order by z.email, z.k
""".replace("NS.", ns + ".")
    script = "\n".join(pre) + f"""
begin isolation level repeatable read;
set local statement_timeout = 0;
\\set phase on
{stmts} \\gexec
select pg_current_xact_id() is not null as wrote \\gset
\\set phase off
{stmts} \\gexec
select 'WROTE|' || (pg_current_xact_id_if_assigned() is not null)::text;
rollback;
"""
    out = psql(script)
    ans = collections.defaultdict(dict)
    for line in out.splitlines():
        p = line.split("|", 3)
        if len(p) == 4 and p[1] in ("on", "off") and p[2] in ("T", "Q", "C", "K"):
            ans[(p[0], p[2], p[3].split("|", 1)[0])][p[1]] = p[3]
    n = len(ans)
    differ = [(k, v) for k, v in ans.items() if v.get("on") != v.get("off")]
    by = collections.Counter(k[1] for k in ans)
    print(f"# {'plant ' + plant if plant else 'the file, live'}: {n} answers compared ({dict(by)}), "
          f"{len({k[0] for k in ans})} people, {len(differ)} differ")
    for k, v in differ[:12]:
        print("  DIFFER", k[0], k[1], k[2][:80], "| on:", str(v.get("on"))[-60:], "| off:", str(v.get("off"))[-60:])
    if n < 100:
        print("RED: too few answers to mean anything")
        sys.exit(1)
    print("GREEN" if not differ else "RED")
    sys.exit(0 if not differ else 1)

if __name__ == "__main__":
    main()
