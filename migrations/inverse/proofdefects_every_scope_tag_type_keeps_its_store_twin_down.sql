-- chair-step: inverse of proofdefects_every_scope_tag_type_keeps_its_store_twin.sql (lane PROOF-DEFECTS, D3) — puts custom.context_tag_copy back to its SC-4 body (one refused tag fails the whole organization's copy again), deactivates the two twins that file registered (app -> record, processed_document -> record; deactivated, never removed, because an archived edge still names its type), and archives the knob context/follow_lag_alert_seconds. No tag and no edge is touched.
-- lane: PROOF-DEFECTS
-- based-on: custom.context_tag_copy(uuid) 1bfa902d1df904519d68a64bd758e3e28ac9e13619a9c10d66cf097e1fdefc92
set local statement_timeout = '120s';

update platform.association_types
   set is_active = false, updated_at = now()
 where target_type = 'record'
   and source_type in ('app', 'processed_document')
   and notes like 'SC-4 P4:%'
   and is_active;

update platform.feature_knob
   set archived_at = now(), archived_reason = 'inverse of proofdefects_every_scope_tag_type_keeps_its_store_twin.sql', archived_by = 'lane PROOF-DEFECTS inverse', updated_at = now()
 where feature = 'context' and key = 'follow_lag_alert_seconds' and archived_at is null;

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
$function$;
