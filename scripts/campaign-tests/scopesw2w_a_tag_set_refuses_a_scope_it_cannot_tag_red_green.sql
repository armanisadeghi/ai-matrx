-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W — THE TAG DOOR (custom.context_tags_set) NEVER DROPS A SCOPE IN
-- SILENCE, measured RED then GREEN on the dev clone
-- (migrations/campaign/scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag.sql).
--
-- THE USE CASE (both seats, nothing written survives — the whole suite is rolled back):
--   test@test.com, a member of Cedar Ridge Physical Therapy, files the project "Post-op ACL return-to-sport
--   protocol review" under Practice Area: Sports rehab and Department: Outpatient Orthopedics.
--   admin@admin.com, at Castellano & Reyes, LLP, files "Doe v. CSV Pharmacy — QME deposition prep" under the
--   Matters Doe, John v. CSV Pharmacy and Nguyen v. CSV Pharmacy; Nadia Brandt (an archived Firm Staff scope)
--   is one of its existing tags, so a re-stated set carries her.
-- THE BREAK THIS CATCHES: a set holding one id that is not a scope the caller may tag — an invented id, a
--   Value made only in the record store (no context.scopes row), another organization's scope, a null —
--   answered ok:true with that id quietly left out (public.set_entity_scopes joins it away).
-- WHAT MUST HOLD (per seat):
--   T1  [own, invented id]      refused, 42501, the plain sentence, DETAIL names the invented id only
--   T2  [own, store-only Value] refused the same way
--   T3  [own, other org's scope] refused the same way (the same sentence: no one learns which ids exist)
--   T4  [own, null]             refused the same way
--   T5  [own A, own B]          ok:true, the entity's tags are exactly {A, B}        (a second, different answer)
--   T6  []                      ok:true, the entity has no scope tag                  (a third)
--   T7  admin only: [own, archived own] ok:true, tags exactly {own, archived}       (archive stays taggable)
-- RED on the body of 2026-10-03 (T1, T2, T4 answer ok:true; T3 refuses in another sentence); GREEN after.
-- When the file is live here the suite ALSO applies the inverse inside its transaction and requires RED.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_tags_set|function:public.set_entity_scopes|relation:projects.projects'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table w2w_fx (k text primary key, v uuid) on commit drop;
insert into w2w_fx values
  ('test_uid',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'),
  ('admin_uid', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('cedar',     '0a54df90-eab8-4d07-ab29-81a45fb41e04'),   -- Cedar Ridge Physical Therapy
  ('castellano','7cd12da2-2213-4378-8fba-a9e2dc4ea657'),   -- Castellano & Reyes, LLP
  ('doe',       '2645730c-97a9-4080-9471-2546d0ce2b66'),   -- Matter: Doe, John v. CSV Pharmacy
  ('nguyen',    '3296bb04-728c-49c4-8f59-ea1314fc7df5'),   -- Matter: Nguyen v. CSV Pharmacy
  ('nadia',     '726ac9e6-8430-4174-9fb2-72c41559172a'),   -- Firm Staff: Nadia Brandt (archived)
  ('alex_tag',  '5b3ce96b-584d-40c0-84fe-ed0db4e7c8ee'),   -- a Tag in Alex Hart's Workspace (admin is no member)
  ('invented',  '9e1c4b7a-3f52-4d18-a6b0-7c2e5d9f1a83'),
  ('p_test',    gen_random_uuid()),
  ('p_admin',   gen_random_uuid()),
  ('store_val', gen_random_uuid());

-- Cedar Ridge's two scopes, made by the suite through the doors (its own fixtures, so the copy's data never moves
-- them): Treatment Focus: Sports rehab and Care Location: Outpatient orthopedics.
do $own$
declare f jsonb := (select jsonb_object_agg(k, v) from w2w_fx); o uuid := (f->>'cedar')::uuid; tp uuid; td uuid; v_s uuid; v_o uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin_uid', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  tp := (custom.context_type_write(o, null, '{"label_singular":"Treatment Focus","label_plural":"Treatment Focuses"}') -> 'row' ->> 'id')::uuid;
  td := (custom.context_type_write(o, null, '{"label_singular":"Care Location","label_plural":"Care Locations"}') -> 'row' ->> 'id')::uuid;
  v_s := (custom.context_scope_write(o, null, tp, '{"name":"Sports rehab"}') -> 'row' ->> 'id')::uuid;
  v_o := (custom.context_scope_write(o, null, td, '{"name":"Outpatient orthopedics"}') -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);
  insert into w2w_fx values ('sports', v_s), ('ortho', v_o);
end $own$;

do $fx$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2w_fx);
begin
  -- Preconditions read from outside the door: every named scope is what the suite says it is.
  if (select count(*) from context.scopes s where s.id in ((f->>'sports')::uuid, (f->>'ortho')::uuid)
        and s.organization_id = (f->>'cedar')::uuid and s.deleted_at is null) <> 2
     or (select count(*) from context.scopes s where s.id in ((f->>'doe')::uuid, (f->>'nguyen')::uuid)
        and s.organization_id = (f->>'castellano')::uuid and s.deleted_at is null) <> 2
     or not exists (select 1 from context.scopes s where s.id = (f->>'nadia')::uuid
                     and s.organization_id = (f->>'castellano')::uuid and s.deleted_at is not null)
     or exists (select 1 from context.scopes s where s.id = (f->>'invented')::uuid)
     or exists (select 1 from iam.organization_member om where om.user_id = (f->>'test_uid')::uuid
                 and om.organization_id = (f->>'castellano')::uuid)
     or exists (select 1 from iam.organization_member om join context.scopes s on s.organization_id = om.organization_id
                 where om.user_id = (f->>'admin_uid')::uuid and s.id = (f->>'alex_tag')::uuid) then
    raise exception 'scopesw2w: precondition — the named scopes or memberships are not as this suite expects on this copy';
  end if;
  -- The fixtures are a system write, and say which system (provenance stamp on platform.associations).
  perform set_config('app.actor_system', 'campaign-suite scopesw2w', true);
  insert into projects.projects (id, name, organization_id, created_by, description)
  values ((f->>'p_test')::uuid, 'Post-op ACL return-to-sport protocol review', (f->>'cedar')::uuid, (f->>'test_uid')::uuid,
          'Quarterly review of the ACL return-to-sport criteria used by the outpatient orthopedics team.'),
         ((f->>'p_admin')::uuid, 'Doe v. CSV Pharmacy — QME deposition prep', (f->>'castellano')::uuid, (f->>'admin_uid')::uuid,
          'Outline of the questions for the panel QME deposition and the exhibits to send ahead.');
  -- The existing tag the admin's set re-states: Nadia Brandt, archived after she was tagged.
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
  values ('project', (f->>'p_admin')::uuid, 'scope', (f->>'nadia')::uuid, (f->>'castellano')::uuid, (f->>'admin_uid')::uuid);
  -- A Value that exists only in the record store: a Record of the Practice Area Table with no old row.
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by, visibility)
  select (f->>'store_val')::uuid, (f->>'cedar')::uuid, s.scope_type_id, 'record',
         jsonb_build_object('name', 'Pediatric vestibular rehab', 'slug', 'pediatric-vestibular-rehab'),
         (f->>'test_uid')::uuid, 'internal'
    from context.scopes s where s.id = (f->>'sports')::uuid;
end
$fx$;

-- One run of T1–T7 for both seats against whatever body is live in this transaction; returns the failures.
create or replace function pg_temp.w2w_run() returns text[] language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2w_fx);
  c_sentence constant text := 'One of those scopes is not one you can tag with. Nothing was saved.';
  v_fails text[] := '{}';
  v_seat text; v_uid uuid; v_p uuid; v_a uuid; v_b uuid; v_foreign uuid;
  v_case record; v_ids uuid[]; v_out jsonb; v_state text; v_msg text; v_detail text; v_tags uuid[];
begin
  foreach v_seat in array array['test', 'admin'] loop
    v_uid := (f ->> (v_seat || '_uid'))::uuid;
    v_p := (f ->> ('p_' || v_seat))::uuid;
    if v_seat = 'test' then
      v_a := (f->>'sports')::uuid; v_b := (f->>'ortho')::uuid; v_foreign := (f->>'doe')::uuid;
    else
      v_a := (f->>'doe')::uuid; v_b := (f->>'nguyen')::uuid; v_foreign := (f->>'alex_tag')::uuid;
    end if;
    for v_case in
      select * from (values
        ('T1', array[v_a, (f->>'invented')::uuid], 'refuse', (f->>'invented')::uuid),
        ('T2', array[v_a, (f->>'store_val')::uuid], 'refuse', (f->>'store_val')::uuid),
        ('T3', array[v_a, v_foreign], 'refuse', v_foreign),
        ('T4', array[v_a, null::uuid], 'refuse', null::uuid),
        ('T5', array[v_a, v_b], 'ok', null::uuid),
        ('T6', '{}'::uuid[], 'ok', null::uuid),
        ('T7', case when v_seat = 'admin' then array[v_a, (f->>'nadia')::uuid] end, 'ok', null::uuid)
      ) t(name, ids, want, bad)
      where t.ids is not null
    loop
      v_out := null; v_state := null; v_msg := null; v_detail := null; v_tags := null;
      begin
        perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        v_out := custom.context_tags_set('project', v_p, v_case.ids);
        perform set_config('role', 'none', true);
        select array_agg(a.target_id order by a.target_id) into v_tags
          from platform.associations_live a
         where a.source_type = 'project' and a.source_id = v_p and a.target_type = 'scope';
        raise exception using errcode = 'P0W2W', message = 'w2w: rolled back';
      exception
        when sqlstate 'P0W2W' then null;
        when others then
          get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
      end;
      perform set_config('role', 'none', true);
      if v_case.want = 'refuse' then
        if v_state is null then
          v_fails := v_fails || format('%s RED (%s): %s answered %s and left the tags %s — it must refuse the whole set',
                                       v_case.name, v_seat, v_case.ids, coalesce(v_out ->> 'ok', 'null'), coalesce(v_tags::text, '{}'));
        elsif v_state <> '42501' or v_msg <> c_sentence then
          v_fails := v_fails || format('%s RED (%s): refused with %s "%s" — want 42501 "%s"', v_case.name, v_seat, v_state, v_msg, c_sentence);
        elsif v_case.bad is not null and (v_detail is null or position(v_case.bad::text in v_detail) = 0
                                          or position(v_a::text in v_detail) > 0) then
          v_fails := v_fails || format('%s RED (%s): DETAIL %s must name %s and not the good id %s', v_case.name, v_seat, v_detail, v_case.bad, v_a);
        else
          raise notice '% GREEN (%): refused, 42501, "%", detail %', v_case.name, v_seat, v_msg, v_detail;
        end if;
      else
        if v_state is not null then
          v_fails := v_fails || format('%s RED (%s): %s refused with %s "%s" — it must be accepted', v_case.name, v_seat, v_case.ids, v_state, v_msg);
        elsif (v_out ->> 'ok') is distinct from 'true'
              or coalesce(v_tags, '{}') is distinct from
                 coalesce((select array_agg(x order by x) from unnest(v_case.ids) x), '{}') then
          v_fails := v_fails || format('%s RED (%s): ok %s, tags %s — want ok true and exactly %s',
                                       v_case.name, v_seat, v_out ->> 'ok', coalesce(v_tags::text, '{}'), v_case.ids);
        else
          raise notice '% GREEN (%): ok, tags exactly %', v_case.name, v_seat, coalesce(v_tags::text, '{}');
        end if;
      end if;
    end loop;
  end loop;
  return v_fails;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_tags_set(text,uuid,uuid[])'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
do $g$
declare v text[] := pg_temp.w2w_run();
begin
  if array_length(v, 1) > 0 then
    raise exception E'scopesw2w: the live body fails % check(s):\n%', array_length(v, 1), array_to_string(v, E'\n');
  end if;
  raise notice 'scopesw2w: GREEN on the live body (both seats, T1–T7)';
end $g$;
\echo 'scopesw2w: the inverse is applied in this transaction; the suite must go RED on it'
\i migrations/inverse/scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag_down.sql
do $r$
declare v text[] := pg_temp.w2w_run();
begin
  if coalesce(array_length(v, 1), 0) = 0 then
    raise exception 'scopesw2w: the inverse (the old silent body) passed every check — this suite guards nothing';
  end if;
  raise notice E'scopesw2w: RED on the inverse, as it must be (% failures):\n%', array_length(v, 1), array_to_string(v, E'\n');
end $r$;
\else
do $old$
declare v text[] := pg_temp.w2w_run();
begin
  if array_length(v, 1) > 0 then
    raise exception E'scopesw2w: % failed on the body live here (the file is not applied):\n%', array_length(v, 1), array_to_string(v, E'\n');
  end if;
end $old$;
\endif
rollback;
\echo 'scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag_red_green: PASS'
