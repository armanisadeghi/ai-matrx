-- chair-step: DOOR-FIX 1's inverse — puts the delete door, the delete verb, the id resolver
-- and the undo back exactly as they stood on the MAIN database at 2026-09-19 13:2x UTC, and
-- removes the two functions this file added.
--
-- IT DELIBERATELY DOES NOT undo any delete that ran while the fix was in place, and it does
-- not drop `custom.record_alias.revoked_at` — a revoked alias is a fact about a merge that was
-- undone, and dropping the column would make those ids resolve to the survivor again, which is
-- a data change dressed as a rollback. After this file the column is simply unread.
--
-- RUN IT:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/inverse/doorfix_the_delete_door_consults_the_one_delete_rule_down.sql --target branch

drop function if exists custom.delete_cascade_closure(uuid, uuid);
-- 🚨 `custom.delete_rule` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). DOOR-FIX 1 created
-- it, and `custom.field_retire` (`leakt10_a_refusal_says_what_is_true.sql`, a later lane on the
-- live write path) has since adopted it to say what a retirement would take with it. Dropping
-- it would take that refusal down with this inverse, which is not the rollback this file
-- describes. The defect IS restored in full: the delete door, the delete verb, the id resolver
-- and the undo are put back below exactly as they stood on 2026-09-19, and NONE of those four
-- bodies consults the one delete rule — which is the disagreement DOOR-FIX 1 closed. The rule
-- stays standing and the door no longer asks it, which is precisely the defect.

CREATE OR REPLACE FUNCTION custom.resolve_id(p_organization_id uuid, p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid := p_id;
  v_next  uuid;
  v_seen  uuid[] := array[]::uuid[];
begin
  -- The chain, not one hop: a record merged into a record that was later merged again has to
  -- answer with the one a person can open, or "the id resolves forever" is only true once.
  loop
    v_seen := v_seen || v_id;
    select a.new_id into v_next
      from custom.record_alias a
     where a.organization_id = p_organization_id and a.old_id = v_id;
    exit when v_next is null;
    exit when v_next = any (v_seen);        -- a cycle answers with where it started looping
    v_id := v_next;
  end loop;
  return v_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;
  return v_at;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.migrate_delete(p_organization_id uuid, p_record_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row      custom.record%rowtype;
  v_names    text;
  v_effects  jsonb;
  v_cascade  uuid[] := '{}';
  v_took     uuid[] := '{}';
  v_child    uuid;
  v_log      uuid;
  v_n        integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_delete');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to delete.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record already deleted is still here and still reversible — custom.record_restore(organization, record) brings it back until its Table''s retention runs out.';
  end if;

  -- ── REC-18, AND IT COMES FIRST. A Field a Rule or a formula depends on is refused, and the
  --    refusal NAMES the dependant — because "this field is in use" tells a person nothing
  --    about what to go and change.
  if v_row.data_class = 'field' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── REC-13. A Home is a RECORD, and the Tables living there have a say. The default is
  --    restrict, stated here rather than inherited from a nullable column, because "what
  --    happens by default" is the half a person actually meets.
  select string_agg(distinct coalesce(t.data ->> 'name', h.table_id::text), ', ') into v_names
    from custom.tables_at_home(p_organization_id, array[p_record_id]) h
    left join custom.record t
      on t.organization_id = p_organization_id and t.id = h.table_id and t.deleted_at is null
   where coalesce(t.data ->> 'on_delete', 'restrict') = 'restrict';
  if v_names is not null then
    raise exception 'This is home to %, so it was not deleted.', v_names
      using errcode = '23503',
            hint = 'REC-13 / T7: deleting a place that tables live in would take those tables and everything in them. The default is to refuse. Move those tables to another home first, or set them to cascade deliberately.';
  end if;

  -- ── REC-12, through W1-REL's own function, which RESTRICTS by name, detaches the set_null
  --    edges itself, and RETURNS what must be cascaded. It deletes nothing: this verb does.
  begin
    v_effects := platform.relation_on_delete(p_organization_id, p_record_id);
    select coalesce(array_agg((x #>> '{}')::uuid), '{}')
      into v_cascade
      from jsonb_array_elements(coalesce(v_effects -> 'cascade_to', '[]'::jsonb)) x;
  exception when undefined_function then
    v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
  end;

  -- ── REC-12 again, for CONTAINMENT: the 500 serial numbers inside Widget. A contained record
  --    has no independent existence, so it goes with its container. This is the cascade T7
  --    names first and it is not a relation's `on_delete` — it is what containment MEANS.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    v_cascade := v_cascade || v_child;
  end loop;

  -- ── THE INVERSE, WORKED OUT AND STORED BEFORE ANYTHING IS DELETED (REC-20 / HIS-8).
  v_log := history.migration_record(p_organization_id, 'delete', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                'also', to_jsonb(v_cascade)),
             coalesce(p_note, format('deleted with %s record(s) it contained or owned', array_length(v_cascade, 1))));

  -- ── ONE DELETE VERB THROUGHOUT (T7). Every id below goes through W1-STORE's
  --    custom.record_delete — the door, the soft delete, the history capture — and this
  --    function never writes `deleted_at` itself.
  foreach v_child in array v_cascade loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
      perform custom.record_delete(p_organization_id, v_child);
      v_took := v_took || v_child;
      v_n := v_n + 1;
    end if;
  end loop;
  perform custom.record_delete(p_organization_id, p_record_id);

  return jsonb_build_object('verb', 'delete', 'record_id', p_record_id,
                            'migration_id', v_log, 'took_with_it', to_jsonb(v_took),
                            'cascaded', v_n, 'relation_effects', v_effects,
                            'reversible_until', 'the end of this table''s retention (REC-23)',
                            'at', now());
end;
$function$

;

CREATE OR REPLACE FUNCTION history.migration_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
begin
  perform custom.assert_store_door(p_organization_id, 'history.migration_log');

  select * into m from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if m.id is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;
  if m.undone_at is not null then
    raise exception 'That Migration was already undone, on %.', m.undone_at
      using errcode = '22023',
            hint = 'HIS-8: undoing it twice would apply the same inverse to values that are already back. Nothing was changed. The undo itself is on the record too, so you can see what it did.';
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience: an undo that wrote
  -- around custom.record_update would skip the door, the envelope, the concurrency check and
  -- the history capture — so the undo itself would not be recorded.
  if v_kind = 'restore' then
    perform custom.record_restore(p_organization_id, v_target);
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    -- The expected version is deliberately NOT passed: an undo is a decision a person has
    -- already made against what they can see now, and refusing it because a background stamp
    -- moved the version would be the store arguing with them. Their write is recorded like
    -- any other, so a later reader sees exactly what the undo overwrote.
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver, 'at', now());
end;
$function$

;

