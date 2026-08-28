-- hr_l1_37_the_decider_can_see_the_change.sql
--
-- 🚨 A LEGAL NAME CHANGE WAS APPROVED ON A SCREEN THAT NEVER SHOWED THE NAME.
-- The decision surface rendered a flow key, a table token and a bare uuid. The server
-- held the value the whole time and returned it in the approve response, so somebody was
-- asked to agree to something nobody had told them — and the surface gave them no way to
-- know that was what was happening.
--
-- `hr._wf_display` already knew WHO (subject_label) and WHAT KIND (flow_label). What it
-- never answered was WHAT CHANGES, FROM WHAT, TO WHAT.
--
-- TWO SOURCES, BECAUSE THE FLOWS GENUINELY DIFFER:
--   · The existing digest contract is (target_token, target_id), so a digest function can
--     only ever describe the row AS IT IS NOW. That is right for leave, timecards and
--     overtime, whose request already lives in the target row — those keep their own
--     digest functions, which are CALLED here, never re-implemented.
--   · It is exactly wrong for a profile edit or an address change, where nothing is
--     written until the decision and the proposal lives in the workflow instance.
--     `wf_digest_whole_row` would have shown the decider the CURRENT legal name and
--     called it a summary of a request to change the legal name. Those flows now diff
--     the instance's `payload.patch` against the live row, so `from` is real.
--
-- WITHHELD HARDER THAN THE SUBJECT LINE: empty whenever the render is contentless OR the
-- reader is not entitled, regardless of tier. A summary of a change IS content, and the
-- contentless render exists precisely to carry none. Proven: the same step returns the
-- change to its approver and `[]` contentless.
--
-- Applied live 2026-08-28 and ledgered.

-- A value a person reads, out of whatever jsonb the payload holds.
--
-- 🚨 AN ADDRESS READ OUT OF KEY ORDER IS NOT AN ADDRESS. jsonb_each_text walks storage
-- order, so a home address first arrived as "Portland, 118 Harbour Way, OR, USA, 97204" —
-- every part correct and the whole thing unreadable, on the one screen whose job is
-- letting somebody confirm a change is right. Known parts are emitted in the order an
-- envelope is written; anything unrecognised keeps its own order and follows, so an
-- unexpected key is never silently dropped.
create or replace function hr._wf_value_text(p_value jsonb)
returns text language sql stable as $$
  select case
    when p_value is null or jsonb_typeof(p_value) = 'null' then null
    when jsonb_typeof(p_value) = 'string' then nullif(btrim(p_value #>> '{}'), '')
    when jsonb_typeof(p_value) = 'object' then
      nullif((
        select string_agg(v, ', ' order by ord, k)
          from jsonb_each_text(p_value) e(k, v)
          left join lateral (
            select array_position(
              array['line1','line2','line3','street','city','locality','region','state',
                    'postal_code','postcode','zip','country'], e.k) as ord) o on true
         where nullif(btrim(v), '') is not null
      ), '')
    when jsonb_typeof(p_value) = 'array' then
      nullif((select string_agg(v, ', ') from jsonb_array_elements_text(p_value) v), '')
    else nullif(btrim(p_value #>> '{}'), '')
  end;
$$;

-- What changes, from what, to what — for the flows whose proposal lives in the instance.
create or replace function hr._wf_change_digest(p_token text, p_row_id uuid, p_patch jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, hr as $fn$
declare v_tbl text; v_cur jsonb := '{}'::jsonb; v_key text; v_out jsonb := '[]'::jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then return '[]'::jsonb; end if;

  v_tbl := case p_token
             when 'hr_employee'           then 'hr.employee'
             when 'hr_employee_private'   then 'hr.employee_private'
             when 'hr_emergency_contact'  then 'hr.emergency_contact'
             else null end;

  if v_tbl is not null and p_row_id is not null then
    -- The "from" half. Without it the decider sees a destination and no journey.
    execute format('select to_jsonb(t) from %s t where t.id = $1', v_tbl)
      into v_cur using p_row_id;
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    v_out := v_out || jsonb_build_object(
      'field', v_key,
      'label', initcap(replace(replace(v_key, '_id', ''), '_', ' ')),
      'from',  hr._wf_value_text(coalesce(v_cur, '{}'::jsonb) -> v_key),
      'to',    hr._wf_value_text(p_patch -> v_key));
  end loop;

  return v_out;
end $fn$;

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._wf_display(uuid,boolean)'::regprocedure);
  if position('A DECISION NEEDS THE CHANGE' in v_def) > 0 then
    raise notice 'hr_l1_37: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  v_uid uuid := auth.uid(); v_entitled boolean; v_subject text; v_title text;$a1$,
$r1$  v_uid uuid := auth.uid(); v_entitled boolean; v_subject text; v_title text;
  v_change jsonb := '[]'::jsonb; v_digest text;$r1$);
  if v_new = v_def then raise exception 'hr_l1_37: declare anchor not found'; end if;

  v_new := replace(v_new,
$a2$  return jsonb_build_object(
    'title',            v_title,$a2$,
$r2$  -- 🚨 A DECISION NEEDS THE CHANGE, NOT THE ROW'S ADDRESS.
  -- This function already knew WHO (subject_label) and WHAT KIND (flow_label), and the
  -- decision surface still showed a flow key, a table token and a bare uuid — so a legal
  -- name change was APPROVED without the screen ever showing the name. The decider was
  -- asked to agree to something nobody had told them.
  --
  -- Two sources, because the flows genuinely differ:
  --   · Payload flows (profile edit, address change) hold the proposal in the INSTANCE;
  --     nothing is written until the decision, so the change is old-vs-new out of the
  --     patch. The existing digest contract cannot express this — it is
  --     (target_token, target_id), so it can only ever describe the row AS IT IS NOW,
  --     which for these flows is precisely the value being changed AWAY from.
  --   · Row flows (leave, timecard, overtime) already hold the request in the target
  --     row, and each has a digest function that words it properly. Those are called,
  --     never re-implemented here.
  --
  -- Gated harder than the subject line: withheld whenever the render is contentless OR
  -- the reader is not entitled, regardless of tier. A summary of what changes is content
  -- by definition, and the contentless render exists precisely to carry none.
  if p_contentless or not v_entitled then
    v_change := '[]'::jsonb;
    v_digest := null;
  elsif inst.payload ? 'patch' then
    v_change := hr._wf_change_digest(
      coalesce(inst.payload ->> 'token', inst.target_token),
      coalesce(nullif(inst.payload ->> 'row_id','')::uuid, inst.target_id),
      inst.payload -> 'patch');
  else
    v_digest := hr._wf_call_digest(inst.flow_key, inst.organization_id,
                                   inst.target_token, inst.target_id);
  end if;

  return jsonb_build_object(
    'title',            v_title,
    'change',           v_change,
    'digest',           v_digest,$r2$);
  if position('A DECISION NEEDS THE CHANGE' in v_new) = 0 then
    raise exception 'hr_l1_37: return anchor not found';
  end if;

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_display';
  if v_src !~ 'A DECISION NEEDS THE CHANGE' then raise exception 'hr_l1_37: did not land'; end if;
  if v_src !~ '''change''' then raise exception 'hr_l1_37: change key missing'; end if;
  if v_src !~ '''digest''' then raise exception 'hr_l1_37: digest key missing'; end if;
  if v_src !~ 'subject_withheld' then raise exception 'hr_l1_37: existing keys lost'; end if;
end $verify$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', '_wf_display', 'hr_l1_37_the_decider_can_see_the_change.sql',
        array['''change''', '''digest''', '''subject_label''', 'p_contentless or not v_entitled'],
        array[]::text[],
        'The decision surface renders what a decision CHANGES from this payload. Dropping '
        || 'change/digest returns the surface to approving a flow key and a uuid, which is '
        || 'how a legal name change was approved without the name ever being shown. The '
        || 'contentless/entitlement guard must stay: a summary of a change is content, and '
        || 'must be withheld wherever the subject name is.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_37_the_decider_can_see_the_change.sql',
        md5('hr_l1_37_the_decider_can_see_the_change'), now(), 0)
on conflict do nothing;
