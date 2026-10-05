-- chair-step: puts back the three bodies tableactions_f replaced — platform.enforce_relation_edge, custom.migrate_merge and custom.migrate_undo — byte for byte as they were live on 2026-10-04 (same signatures and grants).
-- lock: custom
-- lane: TABLE-EXPERIENCE
--
CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb;
  v_tables   uuid[];
  v_mode     text;
  v_live     integer;
  v_max      integer;
  v_other    uuid;
  v_ttable   uuid;
  v_src_org  uuid;
  v_tgt_org  uuid;
  v_opened   boolean;
  v_names    text;
  v_loop     boolean;
begin
  -- GATE ZERO (RELATION-DECLARE, 2026-09-20): A ROW THAT IS NOT LIVE STATES NOTHING.
  -- Every unmaking of an edge in this platform is soft (REL-13), so a withdrawal arrives here
  -- as an UPDATE — and this trigger used to re-read the field's DECLARATION for it, which made
  -- the last act of a relation's life impossible once the column had stopped being a relation:
  --   ERROR: the field Crew behaves as text, so it declares no relation
  -- A withdrawal takes a fact back; there is nothing in it to check. An UNDELETE is a
  -- different thing entirely — that row becomes live and does state a fact again — and it
  -- carries `deleted_at is null`, so it still goes through every gate below.
  if new.deleted_at is not null then
    return new;
  end if;

  -- GATE ONE, and it is structural: an edge nobody declared as a relation is not this
  -- trigger's business, whatever the switch says.
  if new.relation_field_id is null then
    return new;
  end if;

  -- GATE TWO, the switch. `custom/associations_guard` holds the MEANING of these columns off.
  -- A relation edge written while it is off is returned untouched rather than half-enforced:
  -- half a contract is the silent failure this system is built to refuse.
  if not platform.relations_are_on(new.organization_id) then
    return new;
  end if;

  d := platform.relation_declaration(new.organization_id, new.relation_field_id);

  -- ------------------------------------------------------------------ REL-10, the role itself
  if coalesce(new.role, '') <> coalesce(d ->> 'key', '') then
    raise exception 'this relation is stored under the role "%" but its field is called "%"',
      coalesce(new.role, '<none>'), coalesce(d ->> 'key', '<none>')
      using errcode = '23514',
            hint = 'REL-10: a relation is an association whose `role` IS the field key. They are the same string or the edge belongs to no field.';
  end if;

  -- ------------------------------------------------------------------------- REL-12, the wall
  select r.organization_id into v_src_org from custom.record r where r.id = new.source_id limit 1;
  select r.organization_id, r.table_id into v_tgt_org, v_ttable
    from custom.record r where r.id = new.target_id limit 1;

  v_opened := false;
  if v_tgt_org is not null and v_tgt_org is distinct from new.organization_id then
    -- REC-29's ONE opening, read off the Table the relation STARTS at - the same column
    -- `custom.assert_organization_wall` reads, never a second flag.
    select coalesce((t.data ->> 'cross_organization_relations')::boolean, false) into v_opened
      from custom.record s join custom.record t on t.id = s.table_id
     where s.id = new.source_id limit 1;
    -- 🚨 VIS-2 (2026-09-19) — BOTH ORGANIZATIONS, NOT ONE. Same rule, same two
    -- knobs and the same sentence as `custom.assert_organization_wall`: the Table the
    -- relation STARTS at has to allow it, and both organizations have to have turned
    -- cross-organization links on. One organization's flag is not consent from the other.
    if not (coalesce(v_opened, false)
            and custom.cross_organization_links_open(new.organization_id, v_tgt_org)) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = format('REC-29 / REL-12 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                            case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                            case when custom.cross_organization_links_open(new.organization_id, new.organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                            case when custom.cross_organization_links_open(v_tgt_org, v_tgt_org) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end);
    end if;
  end if;
  if v_src_org is not null and v_src_org is distinct from new.organization_id then
    raise exception 'the record this relation starts at belongs to a different organization'
      using errcode = '23503',
            hint = 'REC-29 / REL-12 / T15: organizations are hard walls. An edge is stamped with the organization of the record it starts at; a relation cannot be filed under an organization that does not own its own source.';
  end if;

  -- --------------------------------------------------------------- REL-8, the target's token
  v_mode := d ->> 'target_mode';
  if v_mode <> 'any' then
    select array_agg((t #>> '{}')::uuid) into v_tables
      from jsonb_array_elements(coalesce(d -> 'target_tables', '[]'::jsonb)) t;
    if new.target_type <> 'record' then
      raise exception 'this relation points at tables of ours, and "%" is not one of them', new.target_type
        using errcode = '23514',
              hint = 'REL-8: a relation whose target mode is one or several names tables in this organization. To point at anything registered, declare target_mode `any`.';
    end if;
    if v_ttable is null or not (v_ttable = any (v_tables)) then
      select string_agg(coalesce(t.data ->> 'name', t.id::text), ', ' order by t.data ->> 'name')
        into v_names from custom.record t where t.id = any (v_tables);
      raise exception 'this relation points at %, and that record is not one of them',
        coalesce(v_names, 'a table it does not name')
        using errcode = '23514',
              hint = 'REL-8: target_mode `one` allows exactly the declared table, `several` allows exactly the declared list, and `any` allows anything. Widen the declaration or point at a record of a table it allows.';
    end if;
  end if;

  -- ------------------------------------------------------------------- REL-7, the cardinality
  v_max := case when d ->> 'cardinality' = 'at_most_one' then 1
                else greatest(coalesce((d ->> 'max')::integer, 1), 1) end;
  select count(*) into v_live
    from platform.associations a
   where a.source_type = new.source_type and a.source_id = new.source_id
     and a.role = new.role and a.deleted_at is null
     and a.relation_field_id is not null
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
     limit 1;
    if v_max = 1 then
      raise exception 'this points at one thing at a time, and it already points at %',
        coalesce(platform.relation_label(new.organization_id, new.target_type, v_other), v_other::text)
        using errcode = '23514',
              hint = 'REL-7: cardinality is `at most one` or `many`. Remove the one that is there, or let the field point at many.';
    end if;
    raise exception 'this points at at most % things and already points at that many', v_max
      using errcode = '23514',
            hint = 'REL-7: the field''s own relation_max is the cap. Remove one, or raise the cap on the field.';
  end if;

  -- ------------------------------------------------------------------------ REL-5, the loops
  if not coalesce((d ->> 'loops')::boolean, false) then
    with recursive walk(id, depth) as (
      select new.target_id, 1
      union all
      select a.target_id, w.depth + 1
        from walk w
        join platform.associations a
          on a.source_id = w.id
         and a.relation_field_id = new.relation_field_id
         and a.deleted_at is null
       where w.depth < 32
    )
    select exists (select 1 from walk where id = new.source_id) into v_loop;
    if coalesce(v_loop, false) then
      raise exception 'that would make this point back at itself through the same relation'
        using errcode = '23514',
              hint = 'REL-5 / T11: a relation says whether loops are allowed. This one does not allow them - set loops on the field to let two records point at each other along it. The walk follows this relation only, so two DIFFERENT relations between the same two records were never a loop.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.migrate_merge(p_organization_id uuid, p_winner_id uuid, p_loser_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_win      custom.record%rowtype;
  v_lose     custom.record%rowtype;
  v_log      uuid;
  v_moved    integer := 0;
  v_alts_n   integer := 0;
  v_copied   integer := 0;
  v_retired_n integer := 0;
  v_retargeted integer := 0;
  v_detached integer := 0;
  v_data     jsonb;
  v_vals     jsonb;
  v_env      jsonb;
  v_alts     jsonb;
  v_retired  jsonb;
  v_key      text;
  v_val      jsonb;
  v_declared text[];
  v_rtype    text;
  v_typefld  text;
  v_after    jsonb;
  v_checked  text[] := '{}';
  a          record;
begin
  -- THE CALLER AND THE TWO ROWS, decided on the one ladder — lane REACH's prologue, kept
  -- verbatim: this verb became a client door while DOOR-FIX 2 was landing, and a merge that
  -- skipped the access question would be a door with no lock. Then the switch:
  -- custom.assert_store_door resolves custom/system_enabled and, while it is false, this
  -- store takes writes only from the role that owns custom.record.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_merge');
  perform custom.assert_client_may_change(p_organization_id, p_winner_id, 'custom.migrate_merge', 'editor'::public.permission_level, 'record');
  perform custom.assert_client_may_change(p_organization_id, p_loser_id, 'custom.migrate_merge', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_merge');

  if p_winner_id = p_loser_id then
    raise exception 'A record cannot be merged into itself.'
      using errcode = '22023', hint = 'REC-21: nothing was changed.';
  end if;

  select * into v_win  from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id and r.deleted_at is null;
  select * into v_lose from custom.record r
   where r.organization_id = p_organization_id and r.id = p_loser_id and r.deleted_at is null;
  if v_win.id is null or v_lose.id is null then
    raise exception 'Both records have to be here to merge them, and % is not.',
                    coalesce(case when v_win.id is null then p_winner_id else p_loser_id end)
      using errcode = '02000';
  end if;

  -- THE INVERSE, BEFORE ANYTHING MOVES: the loser's whole document, so undo can put both
  -- records and both ids back exactly (T5's last sentence). `unalias` is what
  -- history.migration_undo revokes, so the loser's id stops resolving to the winner.
  v_log := history.migration_record(p_organization_id, 'merge', v_lose.data_class, p_loser_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_loser_id::text,
                                'unalias', p_loser_id::text,
                                'document', v_lose.data),
             coalesce(p_note, format('merged into %s', p_winner_id)));

  -- WHICH KEYS MAY CARRY AN ENVELOPE. VAL-1: a declared Field of the winner's table, chosen
  -- by the winner's own type field where its table has one.
  v_typefld := custom.table_type_field(p_organization_id, v_win.table_id);
  if v_typefld is not null then
    v_rtype := v_win.data ->> v_typefld;
  end if;
  select coalesce(array_agg(f.data ->> 'key'), '{}') into v_declared
    from custom.applicable_fields(p_organization_id, v_win.table_id, v_rtype) f;

  v_data    := v_win.data;
  v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
  if jsonb_typeof(v_retired) <> 'array' then
    v_retired := '[]'::jsonb;
  end if;

  for v_key, v_val in select * from jsonb_each(v_lose.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;

    if not (v_data ? v_key) then
      -- The winner did not hold this at all: it simply moves across.
      v_data := v_data || jsonb_build_object(v_key, v_val);
      v_copied := v_copied + 1;
      v_moved := v_moved + 1;
      v_checked := v_checked || v_key;

    elsif (v_data -> v_key) is distinct from v_val then
      if v_key = any (v_declared) then
        -- T5: the two phone numbers become ALTERNATES inside the winner's one document, each
        -- with its source — never a second record, and never a value quietly overwritten.
        -- BUILT, not poked: jsonb_set cannot create `_values` when it is absent, which is how
        -- this value used to disappear while being counted as taken.
        v_vals := coalesce(v_data -> '_values', '{}'::jsonb);
        if jsonb_typeof(v_vals) <> 'object' then
          v_vals := '{}'::jsonb;
        end if;
        v_env := coalesce(v_vals -> v_key, '{}'::jsonb);
        if jsonb_typeof(v_env) <> 'object' then
          v_env := '{}'::jsonb;
        end if;
        v_alts := coalesce(v_env -> 'alternates', '[]'::jsonb);
        if jsonb_typeof(v_alts) <> 'array' then
          v_alts := '[]'::jsonb;
        end if;
        -- VAL-4: THE RANK IS THE ARRIVAL ORDER, which is the only ordering a merge knows. The
        -- winner's own value is the trusted one and holds no rank; the first record merged in
        -- ranks 1, the next 2. Never a score, never a confidence.
        v_alts := v_alts || jsonb_build_array(jsonb_build_object(
                    'value', v_val,
                    'rank', jsonb_array_length(v_alts) + 1,
                    -- The SOURCE, written as a source. custom.intern_provenance interns it to
                    -- a pointer and files the description in _sources; a caller that wrote the
                    -- pointer itself would be naming something this store owns (VAL-1).
                    'src', jsonb_build_object('kind', 'record', 'id', p_loser_id::text)));
        v_env  := v_env  || jsonb_build_object('alternates', v_alts);
        v_vals := v_vals || jsonb_build_object(v_key, v_env);
        v_data := v_data || jsonb_build_object('_values', v_vals);
        v_alts_n := v_alts_n + 1;
        v_moved := v_moved + 1;
        v_checked := v_checked || v_key;
      else
        -- NOT A DECLARED FIELD OF THIS TABLE, so it cannot carry an envelope (VAL-1) and
        -- cannot become an alternate. It is kept with its reason rather than dropped.
        v_retired := v_retired || jsonb_build_object(
          'key', v_key,
          'value', v_val,
          'envelope', v_lose.data -> '_values' -> v_key,
          'reason', format('merged from record %s; "%s" is not a declared field of this table, so its other value is kept here rather than as an alternate (VAL-1)', p_loser_id, v_key),
          'at', to_jsonb(now()));
        v_retired_n := v_retired_n + 1;
        v_moved := v_moved + 1;
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_retired) > 0 then
    v_data := v_data || jsonb_build_object('_retired', v_retired);
  end if;

  perform custom.record_update(p_organization_id, p_winner_id, v_data);

  -- THE READ-BACK. A merge that says it took a value and wrote nothing is the exact defect
  -- this file exists to close, so it is asserted against the stored document rather than
  -- trusted.
  select r.data into v_after from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id;
  foreach v_key in array v_checked loop
    if not (v_after ? v_key) then
      raise exception 'The merge says it took "%" from the other record and the winner does not hold it. Nothing was merged.', v_key
        using errcode = '23514',
              hint = 'T5 / VAL-4: a value taken in a merge is in the winner''s one document — as the value itself, or as a ranked alternate with its source.';
    end if;
  end loop;
  foreach v_key in array v_checked loop
    if (v_win.data ? v_key) and (v_win.data -> v_key) is distinct from (v_lose.data -> v_key)
       and (v_lose.data ? v_key)
       and v_key = any (v_declared)
       and not exists (select 1 from jsonb_array_elements(
                         coalesce(v_after -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) x
                        where x -> 'value' = v_lose.data -> v_key) then
      raise exception 'The merge says "%" had another value on the other record and the winner carries no alternate for it. Nothing was merged.', v_key
        using errcode = '23514',
              hint = 'T5 / VAL-4: the losing value is kept as a ranked alternate with its source, never overwritten and never dropped.';
    end if;
  end loop;

  -- Everything the loser contained now hangs off the winner, or the merge would orphan it —
  -- and, since the delete door honours containment, would take it with the loser.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_winner_id::text)
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = p_loser_id;

  -- WHAT POINTED AT THE LOSER POINTS AT THE WINNER. REC-21's "forever" for relations, not
  -- only for readers who remember to resolve the id.
  for a in
    select x.id, x.source_type, x.source_id, x.role
      from platform.associations x
     where x.organization_id = p_organization_id
       and x.target_id = p_loser_id and x.deleted_at is null
  loop
    if exists (select 1 from platform.associations y
                where y.source_type = a.source_type and y.source_id = a.source_id
                  and y.target_id = p_winner_id and y.role is not distinct from a.role
                  and y.id <> a.id) then
      update platform.associations set deleted_at = now() where id = a.id;
      v_detached := v_detached + 1;
    else
      update platform.associations set target_id = p_winner_id where id = a.id;
      v_retargeted := v_retargeted + 1;
    end if;
  end loop;

  -- REC-21: FOREVER. The alias goes in BEFORE the loser is deleted, so there is no instant in
  -- which the id resolves to nothing. `revoked_at` is cleared, because an id merged again
  -- after an undo resolves again.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, p_loser_id, p_winner_id, 'merge',
          coalesce(p_note, 'merged'), v_log)
  on conflict (organization_id, old_id) do update
        set new_id = excluded.new_id, verb = excluded.verb,
            reason = excluded.reason, migration_id = excluded.migration_id,
            revoked_at = null;

  perform custom.record_delete(p_organization_id, p_loser_id);

  return jsonb_build_object('verb', 'merge', 'winner', p_winner_id, 'loser', p_loser_id,
                            'migration_id', v_log, 'values_taken', v_moved,
                            'values_copied', v_copied, 'alternates_added', v_alts_n,
                            'values_retired', v_retired_n,
                            'relations_retargeted', v_retargeted,
                            'relations_detached_as_duplicates', v_detached,
                            'resolves_to', custom.resolve_id(p_organization_id, p_loser_id),
                            'at', now());
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.migrate_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_target uuid;
  v_verb   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_undo');
  if p_log_id is null then
    raise exception 'custom.migrate_undo: which Migration?' using errcode = '22004';
  end if;

  select coalesce(nullif(l.inverse ->> 'record_id', '')::uuid, l.target_id), l.verb
    into v_target, v_verb
    from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if v_target is null and v_verb is null then
    raise exception 'There is no such Migration on the record for this organization.' using errcode = '02000',
            detail = jsonb_build_object('log_id', p_log_id)::text;
  end if;

  -- THE ONE LADDER, on the record the Migration was about. Undoing a merge WRITES — it
  -- restores the loser and revokes its alias — so it asks the same question every other
  -- write in this store asks, at the same level.
  perform custom.assert_client_may_change(p_organization_id, v_target, 'custom.migrate_undo',
                                          'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_undo');

  -- The undo itself is unchanged: `history.migration_undo` writes through the store's own
  -- verbs, and schema `history` stays closed to clients — this door is the reach into it.
  return history.migration_undo(p_organization_id, p_log_id);
end;
$function$
;
