-- Inverse of refkeep_an_archived_record_keeps_every_reference_to_it.sql: the two bodies exactly as they
-- were before it (archive carries out set_null; the hard purge clears nothing).
-- lane: REFERENCE-KEEPS-ARCHIVED

CREATE OR REPLACE FUNCTION platform.relation_on_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e         record;
  v_names   text;
  v_cascade uuid[] := '{}';
  v_detach  integer := 0;
  v_ext     text;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- This verb CHANGES other people's records — the set_null arm takes the pointer out of
  -- every document that held it — so it asks the writing threshold on the record whose
  -- deletion is being carried out, not the reading one.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_on_delete',
                                          'editor'::public.permission_level, 'record');

  -- RESTRICT FIRST, AND IT NAMES THEM.
  select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action = 'restrict';
  if v_names is not null then
    raise exception 'this is still used by %, so it was not deleted', v_names
      using errcode = '23503',
            hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
  end if;

  select string_agg(distinct x.other_type, ', ') into v_ext
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action in ('cascade', 'set_null') and x.other_type <> 'record';
  if v_ext is not null then
    raise exception 'something outside this system (%) is attached to this, and nothing here can change it', v_ext
      using errcode = '0A000',
            hint = 'REL-N-1 / the REL-8 ruling: a relation may POINT at a row behind a connection, and in this version nothing writes back down it. Detach it in the system it lives in, or use that source''s own write-through - a relation is not a route into somebody else''s database.';
  end if;

  for e in select * from platform.relation_delete_effects(p_organization_id, p_record_id) loop
    if e.action = 'cascade' then
      v_cascade := v_cascade || e.other_id;
    elsif e.action = 'set_null' then
      -- THE VALUE GOES TOO, AND IT GOES FIRST (T7).
      if e.other_type = 'record' then
        update custom.record r
           set data = case
                 when jsonb_typeof(r.data -> e.role) = 'array'
                   then jsonb_set(r.data, array[e.role],
                          coalesce((select jsonb_agg(x)
                                      from jsonb_array_elements(r.data -> e.role) x
                                     where (x #>> '{}') is distinct from p_record_id::text),
                                   '[]'::jsonb))
                 else r.data - e.role
               end
         where r.organization_id = p_organization_id
           and r.id = e.other_id
           and r.deleted_at is null
           and r.data ? e.role;
      end if;
      update platform.associations a
         set deleted_at = now()
       where a.organization_id = p_organization_id
         and a.source_id = e.other_id and a.role = e.role
         and a.target_id = p_record_id and a.deleted_at is null;
      v_detach := v_detach + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'restricted_by', '[]'::jsonb,
    'detached',      v_detach,
    'cascade_to',    to_jsonb(v_cascade));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_purge_hard(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_compliance_reason text DEFAULT NULL::text, p_chunk integer DEFAULT 200, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_max   constant integer := 1000;
  c_floor constant integer := 30;       -- the owner's number: 30 days, for compliance only.
  v_chunk integer;
  v_days  integer;
  v_gone  bigint := 0;
  v_ready bigint;
  v_young bigint;
  v_live  bigint;
  v_log   uuid;
begin
  -- ── CHAIR ONLY, AND SAID TWICE. There is no EXECUTE grant to `authenticated` or `anon`, and
  --    the body refuses anyone who is not the owner of `custom.record` as well — so a grant
  --    issued by mistake one day still does not open a hard delete.
  if not pg_has_role(custom.caller_role(),
                     (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                     'member') then
    raise exception 'Destroying records for good is not something a signed-in caller does here.'
      using errcode = '42501',
            hint = 'The owner''s law of 2026-09-20: archive, never delete. Everything a person can reach archives — custom.migrate_purge(organization, table, false) — and a record stays restorable. This door exists for a compliance erasure, is run by a person at a terminal who owns custom.record, and needs a written reason.';
  end if;

  if p_organization_id is null then
    raise exception 'custom.migrate_purge_hard: which organization''s archived records?'
      using errcode = '22004',
            hint = 'Retention is resolved per organization, so a purge that spanned organizations would apply one organization''s window to another''s data.';
  end if;

  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge_hard');

  -- ── THE REASON. Not a flag, not a boolean: the sentence somebody will read in a year when
  --    they ask why these rows are gone. Forty characters is roughly one real sentence.
  if nullif(btrim(coalesce(p_compliance_reason, '')), '') is null
     or length(btrim(p_compliance_reason)) < 40 then
    raise exception 'Nothing was destroyed: a compliance erasure needs a written reason.'
      using errcode = '22004',
            hint = 'Say, in a sentence of at least forty characters, who asked for this erasure, under what obligation, and what it covers. It is stored on the history.migration_log entry this call writes, and it is the only thing that will explain the missing rows afterwards.';
  end if;

  -- ── THE WINDOW. Thirty days at the very least, and the Table''s own retention when it asks
  --    for longer. Read through W3-HIST's one reader, which never answers below the floor.
  v_days := greatest(c_floor,
                     case when p_table_id is null
                          then history.retention_floor_days(p_organization_id)
                          else history.retention_days(p_organization_id, p_table_id) end);

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null
                            and r.deleted_at >= now() - make_interval(days => v_days))
    into v_live, v_young
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id);

  -- ── ARCHIVE FIRST, AND THE REFUSAL NAMES WHAT IS IN THE WAY. A live record in scope is not
  --    a record somebody has decided to erase; it is a record nobody has archived yet.
  if v_live > 0 then
    raise exception 'Nothing was destroyed: % record(s) here are still live.', v_live
      using errcode = '23514',
            hint = 'Archive first. custom.migrate_purge(organization, table, false) archives in resumable passes and nothing is lost; then those records have to sit archived for the retention window before this door will destroy them.';
  end if;
  if v_young > 0 then
    raise exception 'Nothing was destroyed: % record(s) here have been archived for less than % days.', v_young, v_days
      using errcode = '23514',
            hint = 'The window is the promise that an archived record can be brought back. This door ends it, and only after it has actually run out for every record in scope.';
  end if;

  v_chunk := least(greatest(coalesce(p_chunk, 200), 0), c_max);

  select count(*) into v_ready
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id)
     and r.deleted_at is not null
     and r.deleted_at < now() - make_interval(days => v_days)
     -- REC-21: an id that resolves to a surviving record is never destroyed, whatever its age.
     and not exists (select 1 from custom.record_alias a
                      where a.organization_id = r.organization_id and a.old_id = r.id);

  if not coalesce(p_dry_run, true) and v_chunk > 0 and v_ready > 0 then
    -- ── IN CHUNKS, UNDER ITS OWN LOCK TIMEOUT. One statement over an organization held row
    --    locks on sixteen partitions for as long as it took; this one takes `chunk` rows and
    --    gives up waiting rather than block a live write path.
    set local lock_timeout = '3s';
    with doomed as (
      select r.organization_id, r.id
        from custom.record r
       where r.organization_id = p_organization_id
         and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id)
         and r.deleted_at is not null
         and r.deleted_at < now() - make_interval(days => v_days)
         and not exists (select 1 from custom.record_alias a
                          where a.organization_id = r.organization_id and a.old_id = r.id)
       order by r.deleted_at, r.id
       limit v_chunk
    ),
    gone as (
      delete from custom.record c using doomed d
       where c.organization_id = d.organization_id and c.id = d.id
      returning 1
    )
    select count(*) from gone into v_gone;

    -- THE ROW THAT EXPLAINS THE MISSING ROWS. `kind = "none"` because this really is one-way,
    -- and history.migration_record refuses an undo that would be a lie.
    v_log := history.migration_record(
               p_organization_id, 'purge_hard', 'organization', p_organization_id,
               jsonb_build_object('kind', 'none',
                                  'why', 'a compliance erasure is deliberately one-way',
                                  'rows', v_gone,
                                  'table_id', p_table_id,
                                  'window_days', v_days),
               btrim(p_compliance_reason));
  end if;

  return jsonb_build_object(
    'function', 'custom.migrate_purge_hard',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'compliance_reason', btrim(p_compliance_reason),
    'window_days', v_days,
    'dry_run', coalesce(p_dry_run, true),
    'eligible', v_ready,
    'rows_purged', v_gone,
    'remaining', greatest(v_ready - v_gone, 0),
    'done', v_ready - v_gone <= 0,
    'migration_id', v_log,
    'policy', 'Nothing important is deleted here. This door is the compliance exception: every record in scope was already archived, has been archived for at least thirty days, a written reason is stored with the erasure, and an id something still resolves to is never destroyed (REC-21).',
    'at', now());
end;
$function$;
