-- chair-step: this ADDS the record store's copy of every context tag (lane SC-4, P4). It registers fourteen association types `<kind> -> record` (each the twin of the live `<kind> -> scope` type, same label, container side and conveyance — an INSERT into platform.association_types, which the additive allow-list refuses by name, so it comes through this route), one function custom.context_tag_copy(uuid) closed to every client role (REVOKE from public, anon, authenticated, service_role), and two trigger functions with five triggers on platform.associations (the fence and the follow's enqueue). No existing row, function, policy or grant is replaced or dropped; no old tag is read back, marked or changed; the enqueue catches its own failures into ops.system_error and never fails the old edit. Inverse: migrations/inverse/sc4_every_context_tag_has_one_copy_in_the_store_down.sql.
-- lane: SC-4 (PICKER-AND-TAGS: the tag copies)
-- guard: custom/system_enabled
-- window-class: CREATE TRIGGER takes SHARE ROW EXCLUSIVE on platform.associations for the length
--   of this transaction (tag writes wait a moment; readers never wait). Inserting the fourteen
--   types queues one reachability rebuild at commit (platform.trg_reachability_on_rules), measured
--   on the clone before production. Applied directly per the owner's ruling of 2026-09-24
--   ~17:30 PT, under lock_timeout.
--
-- LANE SC-4 PICKER-AND-TAGS — P4, THE TAG COPIES (SCOPES-CONTEXT-TRANSITION.md rev 2 §2.3 P4,
-- moved here from SC-2' by its RESUME HERE).
--
-- THE USE CASE. A Titanium project manager tags a task to AI Matrx's "Matrx Frontend" app in the
-- task's Context section. The current screens write one edge, `task -> scope`. The record store
-- holds a copy of Matrx Frontend under the same id (SC-2'), and the tag must be there too, so the
-- day the owner compares the two systems the same task shows as tagged on both, and the day he
-- flips nothing has to be re-tagged.
--
-- THE ONE REPRESENTATION. In the store a Record's token is `record` (custom.record: its relations
-- are `record -> record`, its archive cascade stamps `deleted_via_type = 'record'`). The other
-- token that names a store id, `custom_record`, is the retired tier-2 table
-- (platform.custom_record, 0 rows). So a copied tag is ONE edge, `<kind> -> record`, role
-- `context_tag`, the old edge's own organization, its creator, its moment, its position and its
-- metadata, plus `metadata.moved_from` naming the old edge. An edge the store already holds
-- between the same two ends under EITHER store token (`record` or `custom_record`, any other
-- role) IS that tag: the copy adds nothing beside it, so no reader ever counts one tag twice.
--
-- WHY A ROLE. Old "everything attached to this" lists read an entity's outgoing edges of every
-- token; the census (PROGRESS-SC-4.md) found three generic doors that would show the copy as a
-- second attachment. The role `context_tag` is what they leave out (the companion file,
-- sc4_old_attached_lists_leave_out_the_tag_copies.sql).
--
-- OLD SIDE WINS, AND ONLY THE FOLLOW WRITES. `custom.context_tag_copy(org)` makes an
-- organization's copied tags equal its old tags (for every scope of that organization that has
-- its copy Record): a missing copy made, an untagged one archived (a scope's own cascade maps to
-- the Record: deleted_via 'scope' -> 'record', same id, so the store's restore revives it), a
-- retag revived, a moved one mirrored, an old edge that is gone archived — never deleted. The
-- fence refuses every other writer making, reviving or re-pointing a copied tag; the old side's
-- own cascades, merges and bulk removals (which only tombstone, delete or move the source) pass,
-- and re-arm the follow, which puts the old side's word back at the next drain.

set local lock_timeout = '30s';
set local statement_timeout = '180s';

-- ── 1. THE TWIN TYPES ────────────────────────────────────────────────────────────────────────
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
       'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
       || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
  from platform.association_types a
 where a.target_type = 'scope'
   and a.is_active
    on conflict (source_type, target_type) do update
   set is_active = true
 where platform.association_types.notes like 'SC-4 P4:%'   -- only ours: re-armed after its inverse
   and not platform.association_types.is_active;

-- ── 2. THE COPY, ONE ORGANIZATION AT A TIME ─────────────────────────────────────────────────
create function custom.context_tag_copy(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  g         record;
  v_twin    platform.associations%rowtype;
  v_other   boolean;
  v_want    boolean;
  v_meta    jsonb;
  v_via_t   text;
  v_via_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := 0;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  -- A scope whose copy Record has not landed yet waits for the copy (counted, never guessed).
  select count(distinct a.id) into n_waiting
    from platform.associations a
    join context.scopes s on s.id = a.target_id
   where a.target_type = 'scope' and s.organization_id = p_organization_id
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = a.target_id
                        and r.data_class = 'record');

  -- ONE TAG PER (source, scope): two old edges between the same two ends (a plain tag and a
  -- class assignment) are one copied tag, live while either is, shaped by the live one.
  for g in
    select x.source_type, x.source_id, x.target_id,
           bool_or(x.deleted_at is null) as live,
           (array_agg(x.id order by (x.deleted_at is null) desc, x.created_at, x.id))[1] as pick_id
      from platform.associations x
      join context.scopes s on s.id = x.target_id
     where x.target_type = 'scope'
       and s.organization_id = p_organization_id
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = x.target_id
                      and r.data_class = 'record')
     group by x.source_type, x.source_id, x.target_id
  loop
    declare
      o platform.associations%rowtype;
    begin
      select * into o from platform.associations where id = g.pick_id;

      -- THE SAME EDGE UNDER EITHER STORE TOKEN: something other than our copy already ties
      -- these two ends in the store.
      select exists (
        select 1 from platform.associations e
         where e.source_type = g.source_type and e.source_id = g.source_id
           and e.target_type in ('record', 'custom_record') and e.target_id = g.target_id
           and e.deleted_at is null
           and not (e.target_type = 'record' and e.role is not distinct from 'context_tag')
      ) into v_other;

      select * into v_twin
        from platform.associations t
       where t.source_type = g.source_type and t.source_id = g.source_id
         and t.target_type = 'record' and t.target_id = g.target_id and t.role = 'context_tag';

      v_want := g.live and not v_other;
      v_meta := coalesce(o.metadata, '{}'::jsonb)
                || jsonb_build_object('moved_from', jsonb_build_object(
                     'table', 'platform.associations', 'id', o.id, 'target_type', 'scope',
                     'role', o.role, 'lane', 'SC-4'));

      if v_twin.id is null then
        if v_want then
          insert into platform.associations
            (source_type, source_id, target_type, target_id, organization_id, label, metadata,
             created_by, created_at, role, position, updated_by_system)
          values (g.source_type, g.source_id, 'record', g.target_id, o.organization_id, o.label, v_meta,
                  o.created_by, o.created_at, 'context_tag', o.position, 'matrx_records.context_follow');
          n_made := n_made + 1;
        elsif g.live and v_other then
          n_same := n_same + 1;
        end if;
      elsif v_want then
        if v_twin.deleted_at is not null then
          update platform.associations
             set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
                 organization_id = o.organization_id, label = o.label, metadata = v_meta, position = o.position
           where id = v_twin.id;
          n_revived := n_revived + 1;
        elsif v_twin.metadata is distinct from v_meta or v_twin.position is distinct from o.position
              or v_twin.label is distinct from o.label or v_twin.organization_id is distinct from o.organization_id then
          update platform.associations
             set metadata = v_meta, position = o.position, label = o.label, organization_id = o.organization_id
           where id = v_twin.id;
          n_updated := n_updated + 1;
        else
          n_current := n_current + 1;
        end if;
      else
        if v_twin.deleted_at is null then
          -- The old side's reason, mapped: a scope's own cascade becomes the Record's (same id),
          -- so the store's restore of that Record revives this tag with it.
          v_via_t  := case when v_other then 'record'
                           when o.deleted_via_type = 'scope' then 'record'
                           else o.deleted_via_type end;
          v_via_id := case when v_other then g.target_id else o.deleted_via_id end;
          update platform.associations
             set deleted_at = coalesce(o.deleted_at, now()), deleted_via_type = v_via_t, deleted_via_id = v_via_id
           where id = v_twin.id;
          n_archived := n_archived + 1;
        elsif v_other and g.live then
          n_same := n_same + 1;
        end if;
      end if;
    end;
  end loop;

  -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
  with gone as (
    update platform.associations t
       set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
     where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
       and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       and not exists (select 1 from platform.associations x
                        where x.target_type = 'scope' and x.target_id = t.target_id
                          and x.source_type = t.source_type and x.source_id = t.source_id)
    returning 1)
  select n_archived + count(*) into n_archived from gone;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting);
end;
$fn$;

comment on function custom.context_tag_copy(uuid) is
  'SC-4 P4. Makes one organization''s copied context tags (<kind> -> record, role context_tag) equal '
  'its old tags (<kind> -> scope), old side winning: made, revived, re-shaped, archived (never deleted). '
  'An edge the store already holds between the same ends under record or custom_record is the same tag. '
  'Called by the context follow (matrx_records.movers.context_follow) inside its copy of the organization.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'context_tag_copy', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
        'p_organization_id names the organization whose copied tags are brought current; it is read only to select that organization''s scopes and their copy Records, and a NULL is refused (22004).',
        'sc4_every_context_tag_has_one_copy_in_the_store.sql',
        'server_only: the context follow (aidream matrx_records.movers.context_follow, on the store owner''s own connection) calls it inside its copy of one organization; no client ever does, and the fence refuses any other writer of a copied tag.',
        false, false);

revoke all on function custom.context_tag_copy(uuid) from public, anon, authenticated, service_role;

-- ── 3. THE FENCE: ONLY THE FOLLOW MAKES, REVIVES OR RE-POINTS A COPIED TAG ─────────────────────
create function platform._context_tag_copy_fence()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$fn$;

comment on function platform._context_tag_copy_fence() is
  'SC-4 P4. Refuses every writer but the store owner''s connection making, reviving, re-pointing or '
  'editing a copied context tag (platform.associations role context_tag) while the scope''s organization '
  'follows the current screens. Tombstones, hard deletes and source moves (the old side''s cascades and merges) pass.';

create trigger _ab_context_tag_copy_fence_ins
  before insert on platform.associations
  for each row when (new.role = 'context_tag')
  execute function platform._context_tag_copy_fence();

create trigger _ab_context_tag_copy_fence_upd
  before update on platform.associations
  for each row when (old.role = 'context_tag' or new.role = 'context_tag')
  execute function platform._context_tag_copy_fence();

-- ── 4. THE FOLLOW: EVERY CHANGE TO AN OLD TAG (OR ITS COPY) RE-ARMS ONE OUTBOX ROW ───────────
create function platform._context_tag_follow_to_the_copy()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row  platform.associations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself).
  if v_row.target_type = 'record'
     and pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return null;
  end if;

  select s.organization_id, s.scope_type_id into v_org, v_type
    from context.scopes s where s.id = v_row.target_id;
  if v_org is null and tg_op = 'UPDATE' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = old.target_id;
  end if;
  if v_org is null then
    return null;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_row.id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:associations:' || v_row.id::text,
          v_org,
          jsonb_build_object('declared', 'platform.associations', 'user_id', auth.uid(),
                             'source_type', v_row.source_type, 'target_type', v_row.target_type))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
    values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
            'platform._context_tag_follow_to_the_copy', sqlstate, sqlerrm,
            jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
end;
$fn$;

comment on function platform._context_tag_follow_to_the_copy() is
  'SC-4 P4, the old side of the tag follow. Every change to an old context tag (target scope) or to its '
  'copy (role context_tag) leaves one re-armed custom.io_outbox row (event context.follow, dedupe per edge) '
  'for the scope''s organization; the follow brings that organization''s copied tags current. Never fails the tag.';

create trigger zz_context_tag_follow_ins
  after insert on platform.associations
  for each row when (new.target_type = 'scope' or new.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();

create trigger zz_context_tag_follow_upd
  after update on platform.associations
  for each row when (old.target_type = 'scope' or new.target_type = 'scope'
                     or old.role = 'context_tag' or new.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();

create trigger zz_context_tag_follow_del
  after delete on platform.associations
  for each row when (old.target_type = 'scope' or old.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();
