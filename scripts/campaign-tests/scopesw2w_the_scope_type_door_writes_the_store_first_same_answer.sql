-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W — THE SCOPE TYPE DOOR (custom.context_type_write) DECIDES AND WRITES IN
-- THE STORE FIRST AND GIVES THE SAME ANSWER WITH THE SAME EFFECT AS THE OLD BODY, for both seats and a non-member,
-- on the dev clone (migrations/campaign/scopesw2w_the_scope_type_door_writes_the_store_first.sql).
--
-- THE USE CASE: Cedar Ridge Physical Therapy's scope types (Insurance Payer, Plan Tier under Practice Area,
-- Referral Source). test@test.com and admin@admin.com are members; test@test.com is no member of Castellano.
-- HOW: as the scope door's suite — every case on the OLD body (the inverse), then on the NEW body, each in
-- its own rolled-back sub-transaction; answer (ok, SQLSTATE, message, JSON with the new id normalised) and
-- effect (the context.scope_types image row, the custom table record, its column Fields) compared per case.
-- No refusal is expected to change. RED on any difference, or when a seat class compared nothing.
-- Round 2 (after scopes-verify-w2w.md): the effect also holds the sweep queue, the search index, history and the
-- Fields made (_scopesw2w_side_effects.sql), and the cases hold JSON-null words and a store-only type.
-- Needs migrations/campaign/scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store.sql live.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_the_scope_type_door_writes_the_store_first_same_answer.sql'
\set expect 'clone'
\set requires 'function:custom.context_type_write|function:custom._ctx_store_type|function:custom.scope_type_row_of'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table w2t_res (body text, seat text, name text, ok boolean, state text, msg text, answer text, effect text) on commit drop;
create temp table w2t_fx (k text primary key, v uuid) on commit drop;
insert into w2t_fx values
  ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'), ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'),
  ('cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04'), ('castellano', '7cd12da2-2213-4378-8fba-a9e2dc4ea657'),
  ('practice', '7fe0bdd8-b758-450b-a81e-767111e4b909'), ('matter_type', '1aaba65d-68de-457e-8a0c-0f2731161d13');

do $setup$
declare f jsonb := (select jsonb_object_agg(k, v) from w2t_fx); v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', f->>'admin', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v := custom.context_type_write((f->>'cedar')::uuid, null, '{"label_singular":"Referral Source","label_plural":"Referral Sources","icon":"share-2"}');
  perform set_config('role', 'none', true);
  insert into w2t_fx values ('referral', (v -> 'row' ->> 'id')::uuid);
  -- A scope type that exists only in the store (no old row): a copy of Referral Source's Table document.
  insert into w2t_fx values ('store_only_type', pg_catalog.gen_random_uuid());
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  select (select x.v from w2t_fx x where x.k = 'store_only_type'), t.organization_id, t.table_id, 'table',
         t.data || '{"name":"Intake Channel","slug":"intake_channels","label_singular":"Intake Channel","label_plural":"Intake Channels"}'::jsonb,
         t.created_by
    from custom.record t where t.organization_id = (f->>'cedar')::uuid and t.id = (v -> 'row' ->> 'id')::uuid;
end $setup$;

\i scripts/campaign-tests/_scopesw2w_side_effects.sql
create or replace function pg_temp.w2t_effect(p_org uuid, p_id uuid) returns text language sql as $e$
  select jsonb_build_object(
    'side_effects', pg_temp.w2w_side_effects(p_org, p_id, p_id),
    'image', (select to_jsonb(st) - 'id' from context.scope_types st where st.id = p_id),
    'store', (select jsonb_build_object('version', r.version, 'data', r.data - 'fields', 'fields', r.data -> 'fields',
                                        'created_by', r.created_by, 'archived', r.deleted_at is not null,
                                        'metadata', r.metadata)
                from custom.record r where r.organization_id = p_org and r.id = p_id),
    'column_fields', (select jsonb_agg(jsonb_build_object('id_is_derived', f.id in (custom._ctx_id('scope-column-field', p_id::text, 'name'),
                                                             custom._ctx_id('scope-column-field', p_id::text, 'description'),
                                                             custom._ctx_id('scope-column-field', p_id::text, 'slug'),
                                                             custom._ctx_id('scope-column-field', p_id::text, 'sort_order')),
                                                        'doc', f.data, 'version', f.version, 'archived', f.deleted_at is not null)
                                     order by f.data ->> 'key')
                         from custom.record f
                        where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
                          and f.data ->> 'entity_definition_id' = p_id::text))::text
$e$;

create or replace function pg_temp.w2t_run(p_body text) returns void language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from w2t_fx);
  c record; v_out jsonb; v_state text; v_msg text; v_eff text; v_id uuid; v_ans text;
begin
  for c in
    select * from (values
      ('test',  'test',  'T1 create',              (f->>'cedar')::uuid, null::uuid, '{"label_singular":"Insurance Payer","label_plural":"Insurance Payers"}'::jsonb),
      ('admin', 'admin', 'T1 create',              (f->>'cedar')::uuid, null, '{"label_singular":"Insurance Payer","label_plural":"Insurance Payers"}'::jsonb),
      ('admin', 'admin', 'T2 create, every word',  (f->>'cedar')::uuid, null,
         '{"label_singular":"Insurance Payer","label_plural":"Insurance Payers","icon":"landmark","color":"teal","description":"Who pays for the visit.","sort_order":6,"max_assignments":1,"default_variable_keys":["payer_name","payer_id"]}'::jsonb),
      ('test',  'test',  'T3 create, slug',        (f->>'cedar')::uuid, null, '{"label_singular":"Payer","label_plural":"Payers","slug":"Payers 2026"}'::jsonb),
      ('admin', 'admin', 'T4 create under a type', (f->>'cedar')::uuid, null,
         jsonb_build_object('label_singular', 'Plan Tier', 'label_plural', 'Plan Tiers', 'parent_type_id', f->>'practice')),
      ('test',  'test',  'T5 parent of another org', (f->>'cedar')::uuid, null,
         jsonb_build_object('label_singular', 'Plan Tier', 'label_plural', 'Plan Tiers', 'parent_type_id', f->>'matter_type')),
      ('test',  'test',  'T6 no organization',     null::uuid, null, '{"label_singular":"Payer","label_plural":"Payers"}'::jsonb),
      ('test',  'test',  'T7 no labels',           (f->>'cedar')::uuid, null, '{"icon":"tag"}'::jsonb),
      ('test',  'test',  'U1 rename',              null, (f->>'referral')::uuid, '{"label_singular":"Referral Channel","label_plural":"Referral Channels"}'::jsonb),
      ('admin', 'admin', 'U2 cap at one',          null, (f->>'referral')::uuid, '{"max_assignments":1,"description":"How the patient found us."}'::jsonb),
      ('admin', 'admin', 'U3 clear the cap',       null, (f->>'referral')::uuid, '{"max_assignments":null}'::jsonb),
      ('admin', 'admin', 'U4 file under a type',   null, (f->>'referral')::uuid, jsonb_build_object('parent_type_id', f->>'practice')),
      ('test',  'test',  'U5 under itself',        null, (f->>'referral')::uuid, jsonb_build_object('parent_type_id', f->>'referral')),
      ('admin', 'admin', 'U6 clear the parent',    null, (f->>'referral')::uuid, '{"parent_type_id":null,"color":"amber"}'::jsonb),
      ('test',  'test',  'U7 slug only',           null, (f->>'referral')::uuid, '{"slug":"referral-sources-2026"}'::jsonb),
      ('test',  'test',  'J1 null plural keeps it', null, (f->>'referral')::uuid, '{"label_plural":null,"color":"rose"}'::jsonb),
      ('admin', 'admin', 'J2 null icon keeps it',  null, (f->>'referral')::uuid, '{"icon":null}'::jsonb),
      ('admin', 'admin', 'J3 null description keeps it', null, (f->>'referral')::uuid, '{"description":null,"sort_order":2}'::jsonb),
      ('test',  'test',  'J4 null singular on the parent path', null, (f->>'referral')::uuid, jsonb_build_object('label_singular', null, 'parent_type_id', f->>'practice')),
      ('admin', 'admin', 'A2 update a store-only type', null, (f->>'store_only_type')::uuid, '{"label_singular":"Renamed"}'::jsonb),
      ('admin', 'admin', 'U8 an invented type',    null, '3c9e2a7b-1d4f-4e6a-8b5c-7f2d9e1a4b60'::uuid, '{"label_singular":"Nothing"}'::jsonb),
      ('non-member', 'test', 'N1 create in a firm she is not in', (f->>'castellano')::uuid, null, '{"label_singular":"Witness","label_plural":"Witnesses"}'::jsonb),
      ('non-member', 'test', 'N2 rename a firm''s type', null, (f->>'matter_type')::uuid, '{"label_singular":"Case"}'::jsonb),
      ('non-member', 'test', 'N3 move a firm''s type', null, (f->>'matter_type')::uuid, '{"parent_type_id":null}'::jsonb)
    ) t(seat, who, name, org, type_id, spec)
  loop
    v_out := null; v_state := null; v_msg := null; v_eff := null; v_id := null;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', f ->> c.who, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_out := custom.context_type_write(c.org, c.type_id, c.spec);
      perform set_config('role', 'none', true);
      v_id := coalesce((v_out -> 'row' ->> 'id')::uuid, c.type_id);
      v_eff := pg_temp.w2t_effect(coalesce(c.org, (select r.organization_id from custom.record r where r.id = v_id limit 1)), v_id);
      raise exception using errcode = 'P0W2T', message = 'rolled back';
    exception
      when sqlstate 'P0W2T' then null;
      when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    perform set_config('role', 'none', true);
    v_ans := v_out::text;
    if c.type_id is null and v_id is not null then
      -- the new type's column Fields have ids derived from its (random) id: named by their column instead
      v_eff := replace(replace(replace(replace(v_eff,
                 custom._ctx_id('scope-column-field', v_id::text, 'name')::text, '<col-name>'),
                 custom._ctx_id('scope-column-field', v_id::text, 'description')::text, '<col-description>'),
                 custom._ctx_id('scope-column-field', v_id::text, 'slug')::text, '<col-slug>'),
                 custom._ctx_id('scope-column-field', v_id::text, 'sort_order')::text, '<col-sort_order>');
      v_ans := replace(v_ans, v_id::text, '<new>');
      v_eff := replace(v_eff, v_id::text, '<new>');
    end if;
    insert into w2t_res values (p_body, c.seat, c.name, v_state is null, v_state, v_msg, v_ans, v_eff);
  end loop;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom.context_type_write(uuid,uuid,jsonb)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
\i migrations/inverse/scopesw2w_the_scope_type_door_writes_the_store_first_down.sql
\endif
select pg_temp.w2t_run('old');
\i migrations/campaign/scopesw2w_the_scope_type_door_writes_the_store_first.sql
select pg_temp.w2t_run('new');

do $cmp$
declare
  r record; v_fails text[] := '{}'; v_pairs jsonb;
begin
  for r in
    select o.seat, o.name, o.ok o_ok, n.ok n_ok, o.state o_state, n.state n_state, o.msg o_msg, n.msg n_msg,
           o.answer o_ans, n.answer n_ans, o.effect o_eff, n.effect n_eff
      from w2t_res o join w2t_res n on n.body = 'new' and n.seat = o.seat and n.name = o.name
     where o.body = 'old' order by o.seat, o.name
  loop
    if r.o_ok is distinct from r.n_ok or r.o_state is distinct from r.n_state or r.o_msg is distinct from r.n_msg then
      v_fails := v_fails || format('%s / %s RED (answer): old %s %s "%s" — new %s %s "%s"', r.seat, r.name,
                                   r.o_ok, coalesce(r.o_state, ''), coalesce(r.o_msg, ''), r.n_ok, coalesce(r.n_state, ''), coalesce(r.n_msg, ''));
    elsif coalesce((r.n_eff::jsonb #>> '{side_effects,sweep_extra}')::int, 0) <> 0 then
      v_fails := v_fails || format('%s / %s RED (H1 class): the new body queued the suggestion sweep %s time(s) more than once per thing',
                                   r.seat, r.name, r.n_eff::jsonb #>> '{side_effects,sweep_extra}');
    elsif r.o_ans is distinct from r.n_ans
          or (r.o_eff::jsonb #- '{side_effects,sweep_extra}') is distinct from (r.n_eff::jsonb #- '{side_effects,sweep_extra}') then
      -- the answer and the effect are each reported, so one difference never hides the other
      if r.o_ans is distinct from r.n_ans then
        v_fails := v_fails || format(E'%s / %s RED (answer JSON):\n old %s\n new %s', r.seat, r.name, r.o_ans, r.n_ans);
      end if;
      if (r.o_eff::jsonb #- '{side_effects,sweep_extra}') is distinct from (r.n_eff::jsonb #- '{side_effects,sweep_extra}') then
        v_fails := v_fails || format(E'%s / %s RED (effect):\n old %s\n new %s', r.seat, r.name, r.o_eff, r.n_eff);
      end if;
    else
      raise notice '% / % SAME (%)', r.seat, r.name, case when r.n_ok then 'accepted' else 'refused ' || r.n_state || ' "' || r.n_msg || '"' end;
    end if;
  end loop;
  select jsonb_object_agg(seat, n) into v_pairs from (select seat, count(*) n from w2t_res where body = 'new' group by seat) x;
  if coalesce((v_pairs ->> 'test')::int, 0) = 0 or coalesce((v_pairs ->> 'admin')::int, 0) = 0 or coalesce((v_pairs ->> 'non-member')::int, 0) = 0 then
    v_fails := v_fails || format('PAIRS RED: a seat class compared nothing %s', v_pairs);
  end if;
  if (select count(*) from w2t_res where body = 'new' and ok) = 0 or (select count(*) from w2t_res where body = 'new' and not ok) = 0 then
    v_fails := v_fails || 'PAIRS RED: the cases must hold both accepted and refused answers'::text;
  end if;
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesw2w type door: % difference(s):\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
  raise notice 'scopesw2w type door: SAME answer and effect, pairs %', v_pairs;
end $cmp$;
rollback;
\echo 'scopesw2w_the_scope_type_door_writes_the_store_first_same_answer: PASS'
