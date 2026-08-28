-- hr_l1_28_reason_words_are_recorded.sql
--
-- hr_l1_26/27 make a stated reason REQUIRED for a wage-bearing position change. But the
-- insert persisted only `change_reason_category_id` — the free-text `change_reason` that
-- satisfied the gate was read once and thrown away.
--
-- So a change justified in the author's own words still landed with reason NULL and
-- metadata `{dating_mode, workflow_instance_id}` — the exact row state the 40.00
-- provenance hunt flagged as the problem. A reason demanded and discarded is worse than
-- no rule at all: it teaches people to type something and changes nothing about what the
-- record can later answer.
--
-- Applied live 2026-08-27 and ledgered. Run after hr_l1_26 and hr_l1_27.

do $mig$
declare v_def text; v_new text; v_anchor text;
begin
  v_def := pg_get_functiondef('hr._l1_apply_position(jsonb,uuid,uuid)'::regprocedure);

  if position('A REASON DEMANDED AND DISCARDED' in v_def) > 0 then
    raise notice 'hr_l1_28: already applied'; return;
  end if;

  v_anchor := 'jsonb_build_object(''dating_mode'', v_mode, ''workflow_instance_id'', p_instance)';
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l1_28: metadata anchor not found in hr._l1_apply_position';
  end if;

  -- replace() rewrites EVERY metadata site, so the correction branch cannot silently keep
  -- the old shape while the amendment branch gets the fix.
  v_new := replace(v_def, v_anchor,
    chr(10) ||
    '    -- 🚨 A REASON DEMANDED AND DISCARDED IS WORSE THAN NO RULE AT ALL.' || chr(10) ||
    '    -- hr_l1_26/27 require a stated reason for a wage-bearing change, but this insert' || chr(10) ||
    '    -- persisted only change_reason_category_id. A change justified in the author''''s own' || chr(10) ||
    '    -- words therefore landed with reason NULL and metadata empty — the exact state the' || chr(10) ||
    '    -- 40.00 provenance hunt flagged. Keep the words beside the dating mode, or the gate' || chr(10) ||
    '    -- is a speed bump that teaches people to type something and changes nothing.' || chr(10) ||
    '    jsonb_strip_nulls(jsonb_build_object(''dating_mode'', v_mode,' || chr(10) ||
    '      ''workflow_instance_id'', p_instance,' || chr(10) ||
    '      ''change_reason'', nullif(btrim(coalesce(p_payload ->> ''change_reason'','''''''')),'''''''')))');

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_l1_apply_position';
  if v_src !~ 'A REASON DEMANDED AND DISCARDED' then
    raise exception 'hr_l1_28: marker did not land';
  end if;
  if v_src !~ 'reason_required' then
    raise exception 'hr_l1_28: refusal envelope lost';
  end if;
  if position('jsonb_build_object(''dating_mode'', v_mode, ''workflow_instance_id'', p_instance)'
              in v_src) > 0 then
    raise exception 'hr_l1_28: a metadata site was left unrewritten';
  end if;
end $verify$;
