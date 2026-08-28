-- hr_l1_29_a_request_nobody_opened.sql
--
-- T-L1-9 clause 2: clicking "Ask HR" on a legal-name edit produced NO workflow
-- instance, NO pending state, and NO refusal. Diagnosed with instrumentation rather
-- than assumption: the door itself is fine and creates an instance when the flow can
-- route. What it did NOT do is notice when `hr.wf_request` refused.
--
-- `hr.wf_request` answers in the refusal-as-data dialect and NEVER raises. Its
-- `{granted:false}` — an inactive flow, no published routing definition, or the
-- pre-flight finding nobody in this employer who could ever approve — was collected
-- into `v_instances` and then ignored, and the function returned
-- `{ok:true, requested:{…}}` regardless. The person was told "sent to HR to approve"
-- while nothing existed anywhere: success-shaped silence.
--
-- Reproduced live before the fix, in a real employer with no approver granted:
--   hr_self_update('hr_employee', <armani>, {"legal_middle_name":"Probe"})
--   → {"ok":true, "requested":{"legal_middle_name":"Probe"}}   -- and no instance
-- and after:
--   → {"ok":false, "reason":"request_not_opened", "fields":["legal_middle_name"],
--      "detail":"Legal Middle Name could not be sent to HR for approval, so nothing
--                was requested: Nobody in this organization can approve a profile
--                edit yet. Grant the authority first, then submit again."}
--
-- Applied live 2026-08-27 and ledgered in public._schema_migrations.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_self_update(text,uuid,jsonb)'::regprocedure);
  if position('A REQUEST NOBODY OPENED' in v_def) > 0 then
    raise notice 'hr_l1_29: already applied'; return;
  end if;

  v_new := replace(v_def,
    $a1$  v_instances jsonb := '[]'::jsonb; v_inst jsonb; v_audit uuid; v_priv_id uuid;$a1$,
    $r1$  v_instances jsonb := '[]'::jsonb; v_inst jsonb; v_audit uuid; v_priv_id uuid;
  v_failed jsonb := '[]'::jsonb; v_fail_fields text[] := '{}';$r1$);
  if v_new = v_def then raise exception 'hr_l1_29: declaration anchor not found'; end if;

  v_new := replace(v_new,
    $a2$    v_instances := v_instances || jsonb_build_object('action_type', v_key, 'instance', v_inst);
  end loop;$a2$,
    $r2$    v_instances := v_instances || jsonb_build_object('action_type', v_key, 'instance', v_inst);

    -- 🚨 A REQUEST NOBODY OPENED IS NOT A REQUEST. `hr.wf_request` answers in the
    -- refusal-as-data dialect and NEVER raises, so its `granted:false` — an inactive
    -- flow, no published routing definition, or the pre-flight finding nobody in this
    -- employer who could ever approve it — used to sail straight past this loop into a
    -- `{ok:true, requested:{…}}` envelope. The person was then told "sent to HR to
    -- approve" while no instance existed, no pending state could render, and no refusal
    -- was ever shown: success-shaped silence, and the field quietly showed its old value
    -- again as though they had never typed anything.
    if coalesce((v_inst ->> 'granted')::boolean, false) is not true then
      v_failed := v_failed || jsonb_build_object(
        'action_type', v_key,
        'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb)
                     from jsonb_object_keys(v_actions -> v_key) k),
        'reason', coalesce(v_inst ->> 'reason', 'request_refused'),
        'detail', v_inst ->> 'detail');
      select array_cat(v_fail_fields, array_agg(k)) into v_fail_fields
        from jsonb_object_keys(v_actions -> v_key) k;
    end if;
  end loop;

  if jsonb_array_length(v_failed) > 0 then
    -- NAMES THE FIELDS, like every other refusal on this door, and says what the
    -- approval route did wrong instead of blaming the person's typing.
    return jsonb_build_object('ok', false, 'reason', 'request_not_opened',
      'applied', v_free, 'failed', v_failed, 'fields', to_jsonb(v_fail_fields),
      'detail', format(
        '%s could not be sent to HR for approval, so nothing was requested: %s',
        (select string_agg(initcap(replace(f, '_', ' ')), ', ')
           from unnest(v_fail_fields) f),
        coalesce(v_failed -> 0 ->> 'detail', v_failed -> 0 ->> 'reason',
                 'this employer has no approval route for it')));
  end if;$r2$);

  if position('A REQUEST NOBODY OPENED' in v_new) = 0 then
    raise exception 'hr_l1_29: loop anchor not found';
  end if;

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_self_update';
  if v_src !~ 'A REQUEST NOBODY OPENED' then raise exception 'hr_l1_29: did not land'; end if;
  if v_src !~ 'fields_not_self_writable' then raise exception 'hr_l1_29: field refusal lost'; end if;
end $verify$;
