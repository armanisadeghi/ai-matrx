-- HANDOVER (2026-09-27) — A REFUSAL NEVER PRINTS AN ID OR A CLOCK.
--
-- The use case: admin@admin.com approved a Patient Capacity column in Cedar Ridge Physical
-- Therapy's chat, reopened it, pressed Approve again and read "That was already approved, on
-- 2026-09-28T01:23:12.271Z." The class: 89 refusal sentences across 74 custom.* doors put a
-- uuid ("There is no record 3f1c… in this organization") or a server clock (UTC) into the words a
-- person reads. The fact belongs in DETAIL, structured, where a screen can say it in the reader's
-- own words and clock.
--
--   1  CENSUS (the class): no `raise exception '…%…', <args>` in a custom.* function interpolates
--      a uuid variable (p_*_id, v_*_id, v_id, p_id), a to_char() clock, a decided_at, or a uuid
--      cast of a parent. RED on the bodies before the lane (89 statements).
--   2  THE USE CASE, through the door as the person: an approval admin decided is decided again;
--      the refusal names who, carries no clock, and its DETAIL says state, decided_at, decided_by
--      and decided_by_name. RED before the lane ("…, on 2026-…").
--   3  The read door names the decider (decided_by_name). RED before the lane.
\i scripts/campaign-tests/_preamble.sql

begin;
do $$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_room    uuid;
  v_appr    jsonb;
  v_appr_id uuid;
  v_msg     text;
  v_detail  text;
  v_hits    text;
  v_read    jsonb;
begin
  -- ── 1  THE CENSUS ────────────────────────────────────────────────────────────────────────
  with f as (
    select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as body
      from pg_proc p where p.pronamespace = 'custom'::regnamespace and p.prokind = 'f'),
  -- The sentence's arguments run from the comma after it to USING (or the statement's end).
  -- (A Postgres regular expression takes ONE greediness for the whole pattern, so the arguments
  -- are cut at USING in a second step rather than by a lazy quantifier.)
  r as (
    select sig, m[1] as said,
           regexp_replace(m[2], '\musing\M.*$', '', 'si') as args
      from f, regexp_matches(body, 'raise\s+exception\s+(''(?:[^'']|'''')*'')\s*,([^;]*);', 'gi') m)
  select string_agg(sig || ': ' || left(said, 80), E'\n' order by sig) into v_hits
    from r
   -- An id is a whole argument of its own (an id handed to a function inside an argument is not
   -- printed); a clock is any to_char(), decided_at, or a parent id cast to text.
   where args ~* '(^|,)\s*([pv]_[a-z_]*_id|v_id|p_id)(::text)?\s*(,|$)'
      or args ~* 'to_char\(|decided_at|v_parent::text';
  if v_hits is not null then
    raise exception E'1: these refusals still print an id or a clock:\n%', v_hits;
  end if;
  raise notice '1 PASSED — no custom.* refusal interpolates an id or a clock.';

  -- ── 2  THE USE CASE ──────────────────────────────────────────────────────────────────────
  perform set_config('app.actor_system', 'campaign-test/handover_a_refusal_never_prints_an_id_or_a_clock', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — East Clinic ' || substr(v_org::text, 1, 8),
          'cedar-ridge-pt-east-' || substr(v_org::text, 1, 8), 'CRE', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'handover guard');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Rooms','slug','treatment-rooms','type','entity',
    'label_singular','Treatment Room','label_plural','Treatment Rooms','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','capacity')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','capacity','label','Patient capacity','plain','number','sort',20));
  v_room := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Hydrotherapy Pool','capacity',3));
  -- The assistant asks, for admin (an agent's request is decided by the person it works for).
  v_appr := custom.work_approval_request(v_org, v_room,
    jsonb_build_object('kind', 'record_patch', 'patch', jsonb_build_object('capacity', 4)),
    'The pool now takes four patients.', null, 'agent', null);
  v_appr_id := (v_appr ->> 'approval_id')::uuid;
  perform custom.work_approval_decide(v_org, v_appr_id, true, null);
  begin
    perform custom.work_approval_decide(v_org, v_appr_id, true, null);
    raise exception '2: an approval was decided twice';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  end;
  if v_msg ~ '\d{4}-\d{2}-\d{2}' then
    raise exception '2: THE WHOLE DEFECT — the sentence carries a clock: "%"', v_msg;
  end if;
  if v_msg !~ '^That was already approved by .+\.$' then
    raise exception '2: the sentence does not say who decided it: "%"', v_msg;
  end if;
  if v_detail is null or (v_detail::jsonb ->> 'state') <> 'approved'
     or (v_detail::jsonb ->> 'decided_at') is null
     or (v_detail::jsonb ->> 'decided_by')::uuid <> c_admin
     or coalesce(v_detail::jsonb ->> 'decided_by_name', '') = '' then
    raise exception '2: the detail is not the structured answer: %', v_detail;
  end if;
  raise notice '2 PASSED — "%" with %', v_msg, v_detail;

  -- ── 3  THE READ DOOR NAMES THE DECIDER ───────────────────────────────────────────────────
  v_read := custom.work_approval_read(v_org, v_appr_id);
  if coalesce(v_read ->> 'decided_by_name', '') = '' or v_read ->> 'state' <> 'approved' then
    raise exception '3: the read door does not name who decided: %', v_read - 'change';
  end if;
  raise notice '3 PASSED — the read door says it was decided by %.', v_read ->> 'decided_by_name';
end
$$;
rollback;
