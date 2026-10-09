-- chair-step: inverse of perf_watch_w3_h_subject_names.sql — restores the perf_watch_w3_a body of ops.perf_watch_declare verbatim, drops ops.perf_subject_names and its door row, and removes metadata.perf_subject_names from every watch.
set local lock_timeout = '3s';
CREATE OR REPLACE FUNCTION ops.perf_watch_declare(p_slug text, p_perf_kind text, p_label text, p_subject jsonb, p_budget_ms numeric, p_budget_stat text, p_cadence_seconds integer, p_owner text, p_source_feature text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c ops.proof_check%rowtype;
  v_person_budget boolean;
  v_changed text[];
begin
  if coalesce(btrim(p_slug), '') = '' or coalesce(btrim(p_label), '') = '' then
    raise exception 'perf_watch_declare: a watch needs a slug and a label' using errcode = '22023';
  end if;
  if p_perf_kind is null or p_perf_kind not in ('door', 'statement', 'job', 'vital', 'page') then
    raise exception 'perf_watch_declare: perf_kind % is not door|statement|job|vital|page', p_perf_kind using errcode = '22023';
  end if;
  if jsonb_typeof(p_subject) is distinct from 'object' then
    raise exception 'perf_watch_declare: the subject must say how the watch is measured (a json object)' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  select * into c from ops.proof_check where slug = p_slug for update;
  if not found then
    insert into ops.proof_check (
      slug, label, description, surface, source_app, source_feature, live_every_seconds, max_cost_usd,
      is_active, organization_id, created_by, kind, perf_kind, perf_subject, budget_ms, budget_stat,
      owner, perf_state, perf_state_since, metadata)
    values (
      p_slug, p_label, p_label, 'perf_watch', 'database', coalesce(nullif(p_source_feature, ''), 'perf'),
      coalesce(p_cadence_seconds, 900), 0, true, v_sys, v_actor, 'perf', p_perf_kind, p_subject,
      p_budget_ms, coalesce(p_budget_stat, 'p95'), p_owner, 'learning', now(),
      jsonb_build_object('perf_declared_budget_ms', p_budget_ms, 'perf_subject_names', ops.perf_subject_names(p_subject)))
    returning * into c;
    return c.id;
  end if;
  if c.kind <> 'perf' then
    raise exception 'perf_watch_declare: slug % belongs to a % check', p_slug, c.kind using errcode = '23505';
  end if;
  v_person_budget := c.budget_ms is distinct from nullif(c.metadata->>'perf_declared_budget_ms', '')::numeric;
  update ops.proof_check
     set label = p_label, description = p_label, perf_kind = p_perf_kind, perf_subject = p_subject,
         budget_stat = coalesce(p_budget_stat, budget_stat),
         live_every_seconds = coalesce(p_cadence_seconds, live_every_seconds),
         owner = coalesce(p_owner, owner),
         source_feature = coalesce(nullif(p_source_feature, ''), source_feature),
         budget_ms = case when v_person_budget then budget_ms else p_budget_ms end,
         metadata = metadata || case when v_person_budget
                                     then jsonb_build_object('perf_budget_set_by_person', true, 'perf_code_budget_ms', p_budget_ms)
                                     else jsonb_build_object('perf_declared_budget_ms', p_budget_ms) end
                             || jsonb_build_object('perf_subject_names', ops.perf_subject_names(p_subject)),
         deleted_at = null
   where id = c.id;
  -- WAVE 3: a re-declared subject measures something else from now on. One marker sample says so
  -- (n = 0, metadata.perf_marker), the history shows the break, and ops.perf_judge reads only
  -- samples after the latest marker, so the old fixture's numbers never judge the new one.
  if c.perf_subject is distinct from p_subject then
    select array_agg(k order by k) into v_changed
      from (select key k from jsonb_each(coalesce(c.perf_subject, '{}'::jsonb))
            union select key from jsonb_each(p_subject)) keys
     where c.perf_subject->k is distinct from p_subject->k;
    insert into ops.perf_sample (check_id, measured_at, source, n, errors, note, state_after, organization_id, created_by, metadata)
    values (c.id, now(),
            case p_perf_kind when 'door' then 'probe' when 'statement' then 'statement' when 'job' then 'job'
                             when 'vital' then 'vital' else 'cli' end,
            0, 0, left(format('subject re-declared (%s changed); earlier samples measured the previous subject',
                              array_to_string(v_changed, ', ')), 1000),
            c.perf_state, v_sys, v_actor,
            jsonb_build_object('perf_marker', true, 'previous_subject', c.perf_subject, 'changed', to_jsonb(v_changed)));
  end if;
  return c.id;
end;
$function$;
update ops.proof_check set metadata = metadata - 'perf_subject_names' where kind = 'perf';
delete from platform.client_callable_door where schema_name = 'ops' and function_name = 'perf_subject_names';
drop function if exists ops.perf_subject_names(jsonb);
