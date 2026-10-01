-- chair-step: lane ORPHAN-CHOICES (2026-10-01, SAFETY-NET-B B0/B11). ONE replaced body, platform.final_switch_adopt_orphan_lists(uuid) (same signature, grants kept). It now also gives every older pick-list choice with no organization its list's organization (row updates on workbench.udt_structured_list_items only; organization_id only — no label, description, order or archive state changes). No table, trigger, index, grant or policy is touched; CREATE OR REPLACE FUNCTION takes only the pg_proc row lock. Not in the access kernel's fingerprint.
-- based-on: platform.final_switch_adopt_orphan_lists(uuid) add4437553a655654e5b2f755fbccaca2dd72d45519084e83591f5fcec5458bd
-- lane: ORPHAN-CHOICES
-- INVERSE: migrations/inverse/orphanchoices_an_adopted_lists_choices_take_its_organization_down.sql
-- TEST: scripts/campaign-tests/orphanchoices_an_adopted_lists_choices_copy_red_green.py (RED before, GREEN after; clone only, one rolled-back transaction, the real mover)
--
-- THE DEFECT (B0). Step 1 gives an older pick list with no organization the one organization that
-- decides it (its maker's, or — since PRESS-AT-SIZE W12 — the one organization whose agent pickers or
-- columns choose from it) by setting the LIST's organization_id. Its choices keep none: they were made
-- before choices had organizations. The mover then plans each choice's Record under the choice's own
-- organization (NULL), and Copy again for the adopting organization is refused by
-- custom.record_write_many ("organization_id is required"), so Step 1 cannot finish green and the press
-- stays off. Production 2026-10-01: "scene options" (9 choices, chosen from by the agent "Generate custom
-- speech") resolves to Matrx System.
--
-- THE FIX (the class). The adoption gives a choice with no organization its list's organization, in the
-- same transaction, for every older list that has an organization (the ones adopted now and any other) —
-- skipping a list that already moved to the new system (its older rows take no writes). Copy again then
-- copies the choices under the list's organization like every other list's.

CREATE OR REPLACE FUNCTION platform.final_switch_adopt_orphan_lists(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_refused jsonb := platform._final_switch_person_refusal();
  v_out jsonb := '[]'::jsonb;
  v_choices int := 0;
  x jsonb;
begin
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  if coalesce((platform._final_switch_last()).direction, 'old') = 'new' then
    return jsonb_build_object('ok', false, 'reason', 'already_there', 'says', 'Everything is already on the new system.');
  end if;
  for x in select e from jsonb_array_elements(platform._final_switch_orphan_lists()) e
            where e ->> 'resolution' = 'organization' loop
    update workbench.udt_structured_lists
       set organization_id = (x ->> 'organization_id')::uuid,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('final_switch_adopted', jsonb_build_object(
             'from', null, 'organization_id', x ->> 'organization_id', 'organization_name', x ->> 'organization_name',
             'why', x ->> 'why', 'run', p_run, 'at', clock_timestamp(), 'by', auth.uid()))
     where id = (x ->> 'id')::uuid and organization_id is null and deleted_at is null;
    v_out := v_out || jsonb_build_object('id', x ->> 'id', 'name', x ->> 'name', 'organization_id', x ->> 'organization_id',
                                         'organization_name', x ->> 'organization_name');
  end loop;
  -- ORPHAN-CHOICES (B0): a choice with no organization takes its list's, so Copy again copies it
  -- under that organization instead of refusing the whole organization. Archived choices too (the
  -- mover carries them, archived); never a list whose older rows already moved.
  update workbench.udt_structured_list_items i
     set organization_id = l.organization_id
    from workbench.udt_structured_lists l
   where l.id = i.list_id
     and i.organization_id is null
     and l.organization_id is not null
     and not platform._older_list_moved_by_switch(l.id);
  get diagnostics v_choices = row_count;
  return jsonb_build_object('ok', true, 'adopted', v_out, 'choices_given_their_list_organization', v_choices,
    'says', (case when jsonb_array_length(v_out) = 0 then 'No older pick list with no organization had a maker in exactly one organization.'
                  else format('Gave %s older pick %s %s maker''s organization: %s.', jsonb_array_length(v_out),
                              case when jsonb_array_length(v_out) = 1 then 'list' else 'lists' end,
                              case when jsonb_array_length(v_out) = 1 then 'its' else 'their' end,
                              (select string_agg(format('%s → %s', e ->> 'name', e ->> 'organization_name'), '; ') from jsonb_array_elements(v_out) e)) end)
            || case when v_choices = 0 then ''
                    else format(' %s %s with no organization took %s list''s.', v_choices,
                                case when v_choices = 1 then 'choice' else 'choices' end,
                                case when v_choices = 1 then 'its' else 'their' end) end);
end;
$function$;
