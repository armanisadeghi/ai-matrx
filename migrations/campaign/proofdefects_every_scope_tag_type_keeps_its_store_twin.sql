-- chair-step: lane PROOF-DEFECTS (D3). The context follow had stopped for admin's Workspace since 2026-09-25: two `<kind> -> scope` association types were registered AFTER SC-4 P4 made the `<kind> -> record` twins once (app -> scope 2026-09-25 14:56, processed_document -> scope "about" 23:25), so custom.context_tag_copy wrote a tag copy the direction guard refuses ("canonical registered direction is record -> processed_document"), the whole organization's copy rolled back, and every edit waited. This file (1) registers the two missing twins, (2) re-creates custom.context_tag_copy so that, before it copies, it registers the `<kind> -> record` twin of every live `<kind> -> scope` type that lacks one (so a type registered from now on brings its twin at the next copy: the class, not the instance; no trigger DDL, so nothing freezes sign-in), and one tag the store still refuses is counted and named in the answer (`refused`) instead of failing the whole organization's copy, and (3) adds the knob context/follow_lag_alert_seconds (platform default 300). No existing row is deleted; no tag is changed by this file; the next drain carries the waiting edits.
-- lane: PROOF-DEFECTS
-- lock: platform
-- based-on: custom.context_tag_copy(uuid) 9862fef8f32964cbcd473aa78efa9980cc471ae77433df0e649a8c8efcb89c16
--
-- Inverse: migrations/inverse/proofdefects_every_scope_tag_type_keeps_its_store_twin_down.sql.
--
-- THE USE CASE. A Harbor Dental office manager marks the "Patient intake checklist" source as being
-- about the Front Desk department (processed_document -> scope, label "about"). The current screens
-- write that edge. The record store's copy of Front Desk must carry the same tag, and every other
-- edit in that organization (a new context value, a renamed scope) must reach the copy within
-- seconds. Before this file, that one tag stopped every edit of the organization from being copied,
-- for as long as the tag existed (46 edits in admin's Workspace, oldest 2026-09-25 05:46 UTC).

set local statement_timeout = '120s';

-- ── 1. THE MISSING TWINS ──────────────────────────────────────────────────────────────────────
-- Same statement as SC-4 P4 section 1: every live `<kind> -> scope` type's twin, same label,
-- container side and conveyance. Today this adds app -> record and processed_document -> record.
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
       'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
       || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
  from platform.association_types a
 where a.target_type = 'scope'
   and a.is_active
on conflict (source_type, target_type) do nothing;

-- ── 2. ONE REFUSED TAG NEVER STOPS AN ORGANIZATION'S COPY ─────────────────────────────────────
-- Same body as sc4_every_context_tag_has_one_copy_in_the_store.sql, plus: each tag's write runs in
-- its own block; a refusal by the store's guards (check_violation, foreign_key_violation,
-- insufficient_privilege, raise_exception) is counted in `refused` and named in `refused_tags`
-- (pair, old edge id, the guard's first line), and the rest of the organization is copied. The
-- follow writes ops.system_error for any refused tag, so it is loud, never silent.
create or replace function custom.context_tag_copy(p_organization_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
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
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3). SC-4 P4 registered the
  -- `<kind> -> record` twins once; a `<kind> -> scope` type registered after it (app, 2026-09-25;
  -- processed_document "about", 2026-09-25) had none, the direction guard refused its copy, and the
  -- whole organization's follow stopped. The twin is registered here, the moment a copy needs it:
  -- same label, container side and conveyance. A row already there is never changed.
  insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
         'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
         || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
    from platform.association_types a
   where a.target_type = 'scope' and a.is_active
     and not exists (select 1 from platform.association_types t
                      where t.source_type = a.source_type and t.target_type = 'record')
  on conflict (source_type, target_type) do nothing;

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
    exception
      when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
        -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED
        -- (lane PROOF-DEFECTS, D3). The follow files ops.system_error for every refused tag.
        n_refused := n_refused + 1;
        if jsonb_array_length(v_refused) < 20 then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object(
            'pair', g.source_type || ' -> record',
            'old_edge_id', g.pick_id,
            'source_id', g.source_id,
            'scope_id', g.target_id,
            'sqlstate', sqlstate,
            'says', left(split_part(sqlerrm, E'\n', 1), 300)));
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
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused);
end;
$function$;

-- ── 3. THE LAG ALERT KNOB ────────────────────────────────────────────────────────────────────
-- How long an edit may wait for the follow before the context inspector turns red and the nightly
-- parity guard files a row. Platform default five minutes (the follow's normal lag is seconds).
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('context', 'follow_lag_alert_seconds', '300'::jsonb, '300'::jsonb, 'integer', 'seconds', 30, 86400,
   'Context copy lag alert',
   'How long an edit to a scope may wait to be copied into the record store before the context '
   'inspector shows the wait in red and the nightly parity guard files it as a defect. The copy '
   'normally takes a few seconds.',
   'agent',
   'Lane PROOF-DEFECTS (D3), 2026-09-26: the follow carries an edit in seconds; five minutes is sixty times that and still well inside a working session.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do update
   set archived_at = null, archived_reason = null, archived_by = null, updated_at = now()
 where platform.feature_knob.archived_at is not null;
