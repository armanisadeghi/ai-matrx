-- chair-step: a STORE FIX (lane REFERENCE-KEEPS-ARCHIVED, chair ruling B3-21 of 2026-10-01: archiving a
--   record keeps every reference other records hold to it). It REPLACES two bodies and adds nothing:
--   `platform.relation_on_delete` (the archive half of a relation's delete rule; its one caller is
--   custom.delete_rule from custom.record_delete, the one archive door every archive path ends in) no
--   longer carries out `set_null` — the pointer and its edge stay; `custom.migrate_purge_hard` (the one
--   door where a row stops existing, chair-only) now carries `on_target_delete` out: `restrict` refuses
--   by name, everything else takes the pointer out of the record that holds it and tombstones the edge.
--   No table, column, index, trigger, policy or grant changes; no row of anybody's data is rewritten.
--   Inverse: `migrations/inverse/refkeep_an_archived_record_keeps_every_reference_to_it_down.sql`.
--   Proof: scripts/campaign-tests/refkeep_an_archived_record_keeps_every_reference.sql (RED at A on the
--   old bodies, GREEN on these, on the dev clone).
-- lock: custom
-- lane: REFERENCE-KEEPS-ARCHIVED
-- based-on: platform.relation_on_delete(uuid, uuid) 8dd19334048e3c953545a72836cee6dde5ea4ab15c887d0c466aa198570191d2
-- based-on: custom.migrate_purge_hard(uuid, uuid, text, integer, boolean) 8756b8e3b5cafcd251008f49ff51242f0c626046e72f2315c5be96b2a6639d60

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
  v_detach  integer := 0;   -- always 0: an archive detaches nothing (kept for the answer's shape)
  v_kept    integer := 0;   -- references kept pointing at the archived record
  v_ext     text;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- This verb is the ARCHIVE half of a relation's delete rule (its one caller is custom.delete_rule
  -- with p_apply, i.e. custom.record_delete, the one archive door). It asks the writing threshold on
  -- the record being archived.
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

  -- AN ARCHIVE KEEPS EVERY REFERENCE TO WHAT IT ARCHIVES (lane REFERENCE-KEEPS-ARCHIVED, chair
  -- ruling B3-21, 2026-10-01). An archive is a delete a person can undo, so nothing it does may be
  -- something a restore cannot put back. This verb used to carry out `set_null` here: it took this
  -- record's id out of every record that pointed at it and tombstoned the edge, so the referring
  -- record lost the reference while the target sat in Archived items, and a restore could only
  -- re-insert it (at the end of a list, never in its place). Now the pointer and its edge stay
  -- exactly as they are; a reader draws the reference as archived and, after a restore, as live
  -- again, with nothing to put back. `set_null` is carried out where a row really stops existing:
  -- custom.migrate_purge_hard. `restrict` still refuses here (a refusal loses nothing), and
  -- `cascade` still archives the referring record with it (recorded in the archive event, and
  -- brought back by the same restore).
  select string_agg(distinct x.other_type, ', ') into v_ext
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action = 'cascade' and x.other_type <> 'record';
  if v_ext is not null then
    raise exception 'something outside this system (%) is attached to this, and nothing here can change it', v_ext
      using errcode = '0A000',
            hint = 'REL-N-1 / the REL-8 ruling: a relation may POINT at a row behind a connection, and in this version nothing writes back down it. Detach it in the system it lives in, or use that source''s own write-through - a relation is not a route into somebody else''s database.';
  end if;

  for e in select * from platform.relation_delete_effects(p_organization_id, p_record_id) loop
    if e.action = 'cascade' then
      v_cascade := v_cascade || e.other_id;
    elsif e.action = 'set_null' then
      v_kept := v_kept + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'restricted_by', '[]'::jsonb,
    'detached',      v_detach,
    'kept',          v_kept,
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
  v_ids   uuid[] := '{}';       -- REFERENCE-KEEPS-ARCHIVED: the rows this chunk destroys
  v_names text;
  v_detached bigint := 0;
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
    select coalesce(array_agg(d.id order by d.deleted_at, d.id), '{}'::uuid[]) into v_ids
      from (select r.id, r.deleted_at
              from custom.record r
             where r.organization_id = p_organization_id
               and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id)
               and r.deleted_at is not null
               and r.deleted_at < now() - make_interval(days => v_days)
               and not exists (select 1 from custom.record_alias a
                                where a.organization_id = r.organization_id and a.old_id = r.id)
             order by r.deleted_at, r.id
             limit v_chunk) d;

    -- ── LANE REFERENCE-KEEPS-ARCHIVED (chair ruling B3-21, 2026-10-01). AN ARCHIVE KEEPS EVERY
    --    REFERENCE TO WHAT IT ARCHIVED (platform.relation_on_delete no longer clears anything), so a
    --    pointer at one of these rows can still sit in the records that hold it. This door is the
    --    one place a row stops existing, so it is where a relation's `on_target_delete` is carried
    --    out: `restrict` refuses by name; otherwise the pointer comes out of the record that holds
    --    it (live or archived: a pointer at nothing is never kept) and the edge is tombstoned.
    --    Before the delete, so every guard still has the target in front of it.
    select string_agg(distinct coalesce(platform.relation_label(p_organization_id, a.source_type, a.source_id),
                                        a.source_id::text), ', ')
      into v_names
      from platform.associations a
     where a.organization_id = p_organization_id
       and a.target_type = 'record' and a.target_id = any (v_ids)
       and a.relation_field_id is not null
       and a.deleted_at is null
       and not (a.source_id = any (v_ids))
       and platform.relation_edge_has_a_live_field(p_organization_id, a.relation_field_id)
       and (platform.relation_declaration(p_organization_id, a.relation_field_id) ->> 'on_delete') = 'restrict';
    if v_names is not null then
      raise exception 'Nothing was destroyed: these are still used by %.', v_names
        using errcode = '23503',
              hint = 'REL-2 / T7: a relation set to refuse still points at a record this erasure would destroy. Remove those references first, then run the erasure again.';
    end if;

    update custom.record r
       set data = case
             when jsonb_typeof(r.data -> x.role) = 'array'
               then jsonb_set(r.data, array[x.role],
                      coalesce((select jsonb_agg(v)
                                  from jsonb_array_elements(r.data -> x.role) v
                                 where not ((v #>> '{}') = any (x.gone))), '[]'::jsonb))
             else r.data - x.role
           end
      from (select a.source_id, a.role, array_agg(a.target_id::text) as gone
              from platform.associations a
             where a.organization_id = p_organization_id
               and a.source_type = 'record'
               and a.target_type = 'record' and a.target_id = any (v_ids)
               and a.relation_field_id is not null
               and a.deleted_at is null
               and not (a.source_id = any (v_ids))
             group by a.source_id, a.role) x
     where r.organization_id = p_organization_id
       and r.id = x.source_id
       and r.data ? x.role
       and (jsonb_typeof(r.data -> x.role) = 'array' or (r.data ->> x.role) = any (x.gone));
    get diagnostics v_detached = row_count;

    update platform.associations a
       set deleted_at = now()
     where a.organization_id = p_organization_id
       and a.target_type = 'record' and a.target_id = any (v_ids)
       and a.deleted_at is null;

    with gone as (
      delete from custom.record c
       where c.organization_id = p_organization_id and c.id = any (v_ids)
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
    'references_cleared', v_detached,
    'remaining', greatest(v_ready - v_gone, 0),
    'done', v_ready - v_gone <= 0,
    'migration_id', v_log,
    'policy', 'Nothing important is deleted here. This door is the compliance exception: every record in scope was already archived, has been archived for at least thirty days, a written reason is stored with the erasure, and an id something still resolves to is never destroyed (REC-21).',
    'at', now());
end;
$function$;
