-- draft: ONE-HOME DD-064 contract step NOT YET APPLIED to production — runs only after onehome_d, after every client sets system|agent|user, and after the history backfill reaches zero; clone-proven to REFUSE while old words remain
-- chair-step: lane ONE-HOME wave 3, DD-064 CONTRACT — the retired actor words code / ai / human stop being accepted.
--   1. Preconditions, each refused by name: zero rows holding an old word in any *_by_tier / actor_tier column
--      (history.row_versions included) and zero function bodies that still set or compare an old word.
--   2. The 7 CHECK constraints admit only system | agent | user (NOT VALID, then VALIDATE).
--   3. platform.canonical_actor_tier stops mapping the old words: an old spelling on the GUC or the header is
--      then INVALID — declared_actor_tier warns and treats the write as undeclared (born unconfirmed, reported),
--      exactly as any other malformed declaration. Loud, never silent.
-- Locks: brief ACCESS EXCLUSIVE per DROP/ADD CONSTRAINT ... NOT VALID (7 tables incl. platform.associations),
--   SHARE UPDATE EXCLUSIVE for VALIDATE; lock_timeout 3s; retry.
-- Idempotent: constraints re-created by name; the mapping function is replaced with the same body each run.
-- (the based-on body is the one onehome_d creates; byte-identical on production once onehome_d has run)
-- based-on: platform.canonical_actor_tier(text) 33258ea73221c9cead7fef95062f8bdd0e90bb98f64088ed5fea1a0d0207a452
set local lock_timeout = '3s';
set local statement_timeout = '600s';

do $$
declare
  r record;
  v_n bigint;
  v_left text := '';
  v_fns text;
begin
  for r in select table_schema, table_name, column_name from information_schema.columns c
            where column_name in ('updated_by_tier', 'created_by_tier', 'actor_tier')
              and exists (select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
                           where n.nspname = c.table_schema and k.relname = c.table_name and k.relkind in ('r', 'p') and not k.relispartition)
  loop
    execute format('select count(*) from %I.%I where %I in (''code'', ''ai'', ''human'')', r.table_schema, r.table_name, r.column_name) into v_n;
    if v_n > 0 then v_left := v_left || format('%s.%s.%s=%s ', r.table_schema, r.table_name, r.column_name, v_n); end if;
  end loop;
  if v_left <> '' then
    raise exception 'DD-064 contract: rows still hold a retired actor word: %', v_left
      using hint = 'Run the batched history backfill (RENAME-PLAN-ONE-HOME §D) and onehome_d first.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_fns from pg_proc p
   where p.prosrc ~ 'set_config\(''app\.actor_tier'', ''(code|ai|human)'''
      or (p.prosrc ~ '(actor_tier\(\)|v_tier|raw_tier|\mtier\M)' and p.prosrc ~ '(=|<>|in \(|IN \()\s*''(code|ai|human)''')
      and p.oid <> 'platform.canonical_actor_tier(text)'::regprocedure;
  if v_fns is not null then
    raise exception 'DD-064 contract: bodies still set or compare a retired actor word: %', v_fns;
  end if;
end $$;

do $$
declare r record; v_col text;
begin
  for r in select c.conrelid::regclass as rel, c.conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c
            where c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '(updated|created)_by_tier'
              and pg_get_constraintdef(c.oid) ~ '''(code|ai|human)''::text'
  loop
    v_col := substring(r.def from '\((\w+_by_tier) IS NULL\)');
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
    execute format('alter table %s add constraint %I check (%I is null or %I = any (array[''system'', ''agent'', ''user''])) not valid',
                   r.rel, r.conname, v_col, v_col);
    execute format('alter table %s validate constraint %I', r.rel, r.conname);
  end loop;
end $$;

create or replace function platform.canonical_actor_tier(p_tier text)
returns text language sql immutable parallel safe
set search_path to 'pg_catalog'
as $f$
  select case lower(trim(p_tier)) when 'system' then 'system' when 'agent' then 'agent' when 'user' then 'user' end
$f$;
comment on function platform.canonical_actor_tier(text) is
  'DD-064: the actor tier in the Doctrine''s words (system | agent | user). The retired spellings are no longer mapped (contract, onehome_d2): they read as an invalid declaration. NULL and anything else -> NULL.';
