-- LANE SN-TRASH (safety-net, 2026-10-01) — a Term list a person archives is in Trash and comes back (T57).
--
-- THE REAL USE CASE: the billing coordinator at Cedar Ridge Physical Therapy keeps a Term list "Rehab billing
-- terms" (CPT, modifier and payer words the transcriber must spell right). She archives it, changes her mind,
-- finds it in Trash as a Term List and restores it. One transaction, ROLLBACK; admin@admin.com in the
-- `authenticated` seat. A stranger (test@test.com) must not see it in their Trash.
\set ON_ERROR_STOP on
\timing off
\set suite 'sntrash_terms_green.sql'
\set requires 'grant:authenticated:public.trash_list|grant:authenticated:public.entity_undelete'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_test    constant uuid := (select id from auth.users where email = 'test@test.com');
  c_org     constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';
  v_id uuid; v_n int; v_ok boolean; v_back boolean;
begin
  perform set_config('app.actor_system', 'campaign-test/sntrash_terms_green', true);
  perform set_config('role', 'postgres', true);
  insert into agent.term_list (name, description, entries, organization_id, created_by)
  values ('Rehab billing terms', 'CPT, modifier and payer words for the transcriber',
          '[{"term":"97110","note":"therapeutic exercise"},{"term":"GP modifier"}]'::jsonb, c_org, c_admin)
  returning id into v_id;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  update agent.term_list set deleted_at = now() where id = v_id;   -- the way its screen archives
  select count(*) into v_n from public.trash_list(array['agent_term_list'], 200, 0) x
   where x.id = v_id and x.label = 'Term List' and x.title like 'Rehab billing terms%';
  if v_n <> 1 then raise exception 'T57 FAIL: the archived Term list is not in Trash as a Term List (% rows)', v_n; end if;
  -- a stranger does not see it
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_test), true);
  select count(*) into v_n from public.trash_list(array['agent_term_list'], 200, 0) x where x.id = v_id;
  if v_n <> 0 then raise exception 'T57 FAIL: test@test.com sees admin''s archived Term list in their Trash'; end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_ok := public.entity_undelete('agent_term_list', v_id);
  perform set_config('role', 'postgres', true);
  v_back := exists (select 1 from agent.term_list where id = v_id and deleted_at is null and jsonb_array_length(entries) = 2);
  if not (coalesce(v_ok, false) and v_back) then raise exception 'T57 FAIL: restore returned % and the list live=%', v_ok, v_back; end if;
  raise notice 'T57 PASS Term list archived, found in Trash as Term List, restored with its 2 entries';
end $t$;
rollback;
