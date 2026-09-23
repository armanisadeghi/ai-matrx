-- ─────────────────────────────────────────────────────────────────────────────
-- THE BRANCH SEED CENSUS — one statement, run against the NIGHTLY DEV CLONE, that decides for
-- EVERY table in the census schemas whether the rehearsal-branch refresh seeds it, and says why.
--
-- 🚨 WHY THIS EXISTS (chair ruling 2026-09-22, lane BRANCH-SEED). The refresh's seed set used to be
-- DERIVED — "a `platform` table another table's foreign key points at, under 2,000 rows" plus eight
-- hand-named registries. A registry nothing holds an FK to, or one outside `platform`, was
-- therefore INVISIBLE to it and arrived EMPTY on the branch: `platform.client_callable_door`
-- 0 of 1,744, `tool.definition` 0 of 696, and until 2026-09-22 `platform.deprecated_relations`,
-- `platform.shareable_resource_registry`, `custom.carrying_rule` and the `custom.record` kernel
-- Tables. Suites then failed on the branch for reasons that were not defects, and campaign files
-- read "already applied" (the ledger is copied) while their rows were gone.
--
-- THE SEED SET IS NOW DECLARED, NOT DERIVED: this census measures every table in the census
-- schemas on the clone and writes `branch-seed-tables.json`, which is CHECKED IN and is what the
-- refresh reads. A table that appears in those schemas and is in neither list is a REFUSAL
-- (`--check`), so a registry added next month cannot silently arrive empty again.
--
-- THE VERDICT, in order. The first clause that matches decides, and its words are the `reason`:
--   1. a declared exclusion            — named in the job, with its reason, for a table no
--                                        measurement can classify (identities are synthesized).
--   2. over the row ceiling            — a table this large is data, not a register.
--   3. empty on the source             — nothing to seed, and seeding it would TRUNCATE whatever
--                                        the branch holds for no gain.
--   4. names a person                  — a foreign key to `auth.users` on a column that is not
--                                        authorship (created_by/updated_by/…). The owner's
--                                        no-real-people law: identities are SYNTHESIZED, never
--                                        copied, so a table keyed on one never crosses.
--   5. every row is a customer's       — it has an organization key and NO row is platform-owned.
--   6. otherwise                       — SEEDED. If it has an organization key the copy carries
--                                        ONLY rows whose key is NULL or the ONE `is_system`
--                                        organization; if it has none it carries every row.
--
-- 🚨 THE FILTER IS THE VALUE, NOT THE TABLE. Every platform table carries `organization_id`, so
-- "it has no org column" is not a safety property. A row crosses only when its organization key is
-- NULL or the one `is_system` organization — a customer's row cannot satisfy that, whatever table
-- it sits in. `platform.provision_spec` names its key `owner_org_id`, so the key is found through
-- the CATALOG (any FK to `iam.organizations`), never by the column's name.
--
-- TRUNCATE-FIRST is measured too: a table every one of whose source rows is platform-owned is
-- emptied before the load (so a repeated run matches the source exactly), and a table that holds
-- ANY customer row is NOT — appending with per-row subtransactions cannot destroy a branch row
-- that the filtered copy was never going to replace.
-- ─────────────────────────────────────────────────────────────────────────────
with sysorg as (select id from iam.organizations where is_system is true limit 1),
t as (
  select n.nspname as s, c.relname as r, c.oid,
    (xpath('/row/c/text()', query_to_xml(format(
      'select count(*) as c from (select 1 from %I.%I limit %s) x', n.nspname, c.relname, :ceiling + 1),
      false, true, '')))[1]::text::bigint as n_rows,
    pg_total_relation_size(c.oid) as n_bytes,
    -- every table a foreign key of this one reaches AND that at least one source row actually
    -- points at (a NULL-everywhere key needs no parent: iam.industries.default_template_id is
    -- 0 of 9), except itself, auth.* (identities are synthesized) and iam.organizations (seeded by
    -- the refresh's own step). --check refuses a SEEDED table whose parent is outside the census:
    -- that parent is never seeded, so every row that names it is refused.
    (select array_agg(distinct fk.parent order by fk.parent)
       from (select pn.nspname||'.'||pc.relname as parent, fa.attname
               from pg_constraint k join pg_class pc on pc.oid = k.confrelid
               join pg_namespace pn on pn.oid = pc.relnamespace
               join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = k.conkey[1]
              where k.conrelid = c.oid and k.contype = 'f' and k.confrelid <> c.oid
                and pn.nspname <> 'auth' and not (pn.nspname = 'iam' and pc.relname = 'organizations')
             offset 0) fk   -- the fence: the row test below must only ever see a real FK column
      where (xpath('/row/c/text()', query_to_xml(format(
              'select count(*) as c from (select 1 from %I.%I where %I is not null limit 1) x',
              n.nspname, c.relname, fk.attname), false, true, '')))[1]::text::int > 0) as fk_parents
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and not c.relispartition
    and n.nspname = any (string_to_array(:'schemas', ','))
),
f as (
  select t.*,
    (select string_agg(distinct a.attname, ',' order by a.attname) from pg_constraint k
       join lateral unnest(k.conkey) u(att) on true
       join pg_attribute a on a.attrelid = t.oid and a.attnum = u.att
       join pg_class fc on fc.oid = k.confrelid join pg_namespace fn on fn.oid = fc.relnamespace
     where k.conrelid = t.oid and k.contype = 'f' and fn.nspname = 'auth' and fc.relname = 'users'
       and a.attname <> all (string_to_array(:'authorship', ','))) as identity_cols,
    (select string_agg(distinct a.attname, ',' order by a.attname) from pg_constraint k
       join lateral unnest(k.conkey) u(att) on true
       join pg_attribute a on a.attrelid = t.oid and a.attnum = u.att
       join pg_class fc on fc.oid = k.confrelid join pg_namespace fn on fn.oid = fc.relnamespace
     where k.conrelid = t.oid and k.contype = 'f' and fn.nspname = 'auth' and fc.relname = 'users'
       and a.attname = any (string_to_array(:'authorship', ','))) as authorship_cols,
    (select a.attname from pg_constraint k
       join lateral unnest(k.conkey) u(att) on true
       join pg_attribute a on a.attrelid = t.oid and a.attnum = u.att
       join pg_class fc on fc.oid = k.confrelid join pg_namespace fn on fn.oid = fc.relnamespace
     where k.conrelid = t.oid and k.contype = 'f' and fn.nspname = 'iam' and fc.relname = 'organizations'
     order by (a.attname = 'organization_id') desc, a.attname limit 1) as org_fk_col,
    exists(select 1 from pg_attribute a
            where a.attrelid = t.oid and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped) as has_org_col
  from t
),
g as (select f.*, case when f.has_org_col then 'organization_id' else f.org_fk_col end as filter_col from f),
h as (
  select g.*,
    case when g.n_rows > 0 and g.filter_col is not null then
      (xpath('/row/c/text()', query_to_xml(format(
        'select count(*) as c from (select 1 from %I.%I where %I is null or %I = %L limit %s) x',
        g.s, g.r, g.filter_col, g.filter_col, (select id from sysorg), :ceiling + 1), false, true, '')))[1]::text::bigint
    else g.n_rows end as platform_rows
  from g
),
v as (
  select h.*,
    (select x.reason from json_each_text(:'declared'::json) x(name, reason) where x.name = h.s||'.'||h.r) as declared_reason,
    (select x.trig from json_each_text(:'restoreloaded'::json) x(name, trig) where x.name = h.s||'.'||h.r) as restore_trigger
  from h
),
d as (
  select v.*,
    case
      when v.declared_reason is not null                       then false
      when v.n_rows > :ceiling                                 then false
      when v.n_bytes > :byteceiling                            then false
      when v.n_rows = 0                                        then false
      when v.identity_cols is not null                         then false
      when v.filter_col is not null and v.platform_rows = 0    then false
      else true end as seed,
    case
      when v.declared_reason is not null then v.declared_reason
      when v.n_rows > :ceiling then
        'over the '||:ceiling||'-row ceiling ('||v.n_rows||'+ rows on the source): a table this large is data, not a register'
      when v.n_bytes > :byteceiling then
        'over the '||pg_size_pretty(:byteceiling::bigint)||' size ceiling ('||pg_size_pretty(v.n_bytes)||' on the source, '||v.n_rows||' rows): a table this heavy is data, not a register, and a per-row seed load of it outlives the branch''s statement timeout'
      when v.n_rows = 0 then
        'empty on the source, so there is nothing to seed and emptying the branch copy could only destroy'
      when v.identity_cols is not null then
        'names a person: a foreign key to auth.users on '||v.identity_cols||', which is not an authorship column. Identities are synthesized on the branch, never copied'
      when v.filter_col is not null and v.platform_rows = 0 then
        'every one of its '||v.n_rows||' rows belongs to a customer organization ('||v.filter_col||'), so it is user data and none of it may cross'
      when v.restore_trigger is not null then
        'reference/registry: '||v.n_rows||' rows, LOADED WITH THE RESTORE immediately before the dump creates its closing trigger '||v.restore_trigger||', which refuses every insert (it may only shrink) — a per-row load is refused by design'
      when v.filter_col is not null then
        'reference/registry: '||v.platform_rows||' of '||v.n_rows||' rows are platform-owned ('||v.filter_col||' is null or the one is_system organization) and only those are copied'
      else
        'reference/registry: '||v.n_rows||' rows, and the table has no key to an organization or an identity, so no customer row can sit in it'
    end as reason
  from v
)
select json_build_object(
  'row_ceiling', :ceiling,
  'byte_ceiling', :byteceiling,
  'schemas', string_to_array(:'schemas', ','),
  'authorship_columns', string_to_array(:'authorship', ','),
  'system_organization_is', 'iam.organizations where is_system is true',
  'seeded', (select count(*) from d where seed),
  'excluded', (select count(*) from d where not seed),
  'tables', (select json_agg(json_build_object(
      'table', s||'.'||r,
      'rows', n_rows,
      'platform_rows', platform_rows,
      'filter_column', filter_col,
      'identity_columns', identity_cols,
      'authorship_columns', authorship_cols,
      'seed', seed,
      'truncate_first', seed and platform_rows = n_rows,
      'bytes', n_bytes,
      'fk_parents', fk_parents,
      'load_with_restore', restore_trigger,
      'reason', reason) order by s, r) from d)
);
