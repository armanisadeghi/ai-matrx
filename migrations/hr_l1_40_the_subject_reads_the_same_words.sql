-- hr_l1_40_the_subject_reads_the_same_words.sql
--
-- 🚨 A RENDERING FIX THAT LANDS ON ONE SIDE OF A TRANSACTION.
-- The decider's queue was given human labels and a change summary. The requester's own
-- list — "Waiting on others", their OWN filed requests — kept sending nothing but the raw
-- flow key, so a person read "leave_request" about their own leave while the approver
-- read "Leave request · 18 Sep – 19 Sep 2026 · 8 hours". The subject ended up knowing
-- less about their own request than the stranger deciding it.
--
-- hr.wf_pending's waiting_on_others rows now carry flow_label and the same
-- _wf_row_summary the queue uses. Applied live 2026-08-28 and ledgered.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.wf_pending(uuid,jsonb)'::regprocedure);
  if position('THE SUBJECT READS THE SAME WORDS' in v_def) > 0 then
    raise notice 'hr_l1_40: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'state', i.state, 'submitted_at', i.submitted_at))
        from hr.workflow_instance i$a1$,
$r1$      -- 🚨 THE SUBJECT READS THE SAME WORDS THE DECIDER DOES.
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'flow_label', coalesce(ft.label, i.flow_key),
                                          'summary', hr._wf_row_summary(i.flow_key, i.target_token, i.target_id),
                                          'state', i.state, 'submitted_at', i.submitted_at))
        from hr.workflow_instance i
        left join lateral (
          select ft2.label from hr.workflow_flow_type ft2
           where ft2.flow_key = i.flow_key and ft2.deleted_at is null
           order by (ft2.organization_id = i.organization_id) desc limit 1) ft on true$r1$);
  if v_new = v_def then raise exception 'hr_l1_40: waiting_on_others anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_pending';
  if v_src !~ 'THE SUBJECT READS THE SAME WORDS' then raise exception 'hr_l1_40: did not land'; end if;
  if v_src !~ '''flow_label''' then raise exception 'hr_l1_40: flow_label missing'; end if;
  if v_src !~ 'needs_my_decision' then raise exception 'hr_l1_40: queue lost'; end if;
end $verify$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', 'wf_pending', 'hr_l1_40_the_subject_reads_the_same_words.sql',
        array['''flow_label''', '''summary''', 'needs_my_decision', 'waiting_on_others'],
        array[]::text[],
        'The requester''s own list must carry the same human label and summary the decider gets.')
on conflict do nothing;
