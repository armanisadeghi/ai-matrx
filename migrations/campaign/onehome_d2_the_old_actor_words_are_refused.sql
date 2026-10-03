-- draft: ONE-HOME DD-064 contract — clone-proven 2026-10-03 (ajrnyxwasqbmxdmzvfdy); NOT applied to production: the installed Matrx Local 1.4.263 (this Mac, app_instances last seen 2026-10-01) still sends x-matrx-actor-tier: code from its sync engine — it goes once that install reports >= 1.4.295 (first build declaring system)
-- chair-step: lane ONE-HOME wave 3, DD-064 CONTRACT — the retired actor words code / ai / human stop being accepted
--   on WRITES. History (history.row_versions) is append-only audit: it is never rewritten and never gated here; its
--   old rows keep reading correctly because platform.canonical_actor_tier() and custom.retired_actor_words() still
--   translate them for readers.
--   1. Preconditions, each refused by name: zero rows holding an old word in any *_by_tier / actor_tier column of a
--      LIVE table (schema history excluded), and zero function bodies that still SET app.actor_tier to an old word.
--   2. The 7 CHECK constraints admit only system | agent | user (NOT VALID, then VALIDATE).
--   3. The write doors stop accepting the old spellings — an old word on the GUC or the x-matrx-actor-tier header
--      is then INVALID: declared_actor_tier warns and treats the write as undeclared (GUC) or as the person (header),
--      exactly as any other malformed declaration. Loud, never silent. Doors rewritten (live body read in this
--      transaction, each expected fragment asserted present exactly once, refused by name otherwise):
--        platform.declared_actor_tier(), platform.actor_declaration_report(), platform.write_is_a_persons_own(),
--        custom._entity_custom_fields_guard(), platform.dated_change_create(...).
--      platform.canonical_actor_tier(text) is NOT changed: it is the readers' translator for history.
-- Locks: brief ACCESS EXCLUSIVE per DROP/ADD CONSTRAINT ... NOT VALID (7 tables incl. platform.associations),
--   SHARE UPDATE EXCLUSIVE for VALIDATE; lock_timeout 3s; retry.
-- Idempotent: constraints re-created by name only while they still admit an old word; a door already rewritten
--   (no old fragment, new fragment present) is skipped.
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
              and table_schema <> 'history'
              and exists (select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
                           where n.nspname = c.table_schema and k.relname = c.table_name and k.relkind in ('r', 'p') and not k.relispartition)
  loop
    execute format('select count(*) from %I.%I where %I in (''code'', ''ai'', ''human'')', r.table_schema, r.table_name, r.column_name) into v_n;
    if v_n > 0 then v_left := v_left || format('%s.%s.%s=%s ', r.table_schema, r.table_name, r.column_name, v_n); end if;
  end loop;
  if v_left <> '' then
    raise exception 'DD-064 contract: live rows still hold a retired actor word: %', v_left
      using hint = 'Find the writer that stored it (a direct column write past the stamp trigger) and fix it first.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_fns from pg_proc p
   where p.prosrc ~* 'set_config\(\s*''app\.actor_tier''\s*,\s*''(code|ai|human)'''
      or p.prosrc ~* 'set\s+(local\s+)?app\.actor_tier\s*(=|to)\s*''(code|ai|human)''';
  if v_fns is not null then
    raise exception 'DD-064 contract: bodies still declare a retired actor word: %', v_fns;
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

-- The write doors. Each row: function, old fragment, new fragment. The live definition is read here and the
-- fragment swapped only when it occurs exactly once; a door that already carries the new fragment is skipped.
do $$
declare
  r record;
  v_def text;
  v_n int;
begin
  for r in select * from (values
    ('platform.declared_actor_tier()',
     E'IF platform.canonical_actor_tier(raw) IS NOT NULL THEN\n      RETURN platform.canonical_actor_tier(raw);',
     E'IF lower(trim(raw)) IN (''system'', ''agent'', ''user'') THEN\n      RETURN lower(trim(raw));'),
    ('platform.declared_actor_tier()',
     E'IF hdr IN (''agent'', ''system'', ''ai'', ''code'') THEN\n        RETURN platform.canonical_actor_tier(hdr);',
     E'IF hdr IN (''agent'', ''system'') THEN\n        RETURN hdr;'),
    ('platform.actor_declaration_report()',
     'IF raw IS NOT NULL AND platform.canonical_actor_tier(raw) IS NOT NULL THEN',
     'IF raw IS NOT NULL AND lower(trim(raw)) IN (''system'', ''agent'', ''user'') THEN'),
    ('platform.actor_declaration_report()',
     'IF hdr IN (''agent'',''system'',''ai'',''code'') THEN',
     'IF hdr IN (''agent'',''system'') THEN'),
    ('platform.write_is_a_persons_own()',
     'platform.canonical_actor_tier(v_tier) is distinct from ''user''',
     'lower(trim(v_tier)) is distinct from ''user'''),
    ('custom._entity_custom_fields_guard()',
     'v_hdr in (''agent'', ''system'', ''ai'', ''code'')',
     'v_hdr in (''agent'', ''system'')'),
    ('platform.dated_change_create(uuid,text,uuid,jsonb,jsonb,timestamp without time zone,text,text,text,text,timestamp with time zone,uuid,text)',
     'p_provenance is not null and platform.canonical_actor_tier(p_provenance) is null',
     'p_provenance is not null and lower(trim(p_provenance)) not in (''system'', ''agent'', ''user'')')
  ) t(fn, old_frag, new_frag)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n = 0 and position(r.new_frag in v_def) > 0 then
      continue;
    end if;
    if v_n <> 1 then
      raise exception 'DD-064 contract: % carries the expected old fragment % times, not once — its body moved; stop and re-read it', r.fn, v_n;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end $$;

comment on function platform.canonical_actor_tier(text) is
  'DD-064: the actor tier in the Doctrine''s words (system | agent | user). READERS ONLY after the contract (onehome_d2): it still translates the retired spellings code/ai/human so append-only history rows read correctly. No write door accepts a retired spelling any more.';
