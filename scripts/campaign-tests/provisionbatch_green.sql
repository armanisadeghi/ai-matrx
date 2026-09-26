-- LANE PROVISION-BATCH-FIX — A BATCH OWES ITS BASE CONTRACT EXACTLY THE WAY ONE TABLE DOES.
--
-- THE REAL CASE: Harbor Point Dental Studio's office manager asks for two tables in one request:
-- "Insurance claims" (what was billed to which carrier) and "Claim appeals" (an appeal points at
-- the claim it contests). That is platform.provision({"tables": [...]}) -> platform.provision_batch.
-- Since 2026-09-21 the base-contract foreign keys (organization_id -> iam.organizations,
-- created_by / updated_by -> auth.users) are deferred to platform.provision_attach_base_contract,
-- run in its OWN short transaction after the build commits. The batch re-certified its members
-- with its own copy of the certify loop, which did not know that, so EVERY batch refused with
-- base_org_fk / base_created_by_fk / base_updated_by_fk missing (lane CLONE-LEVEL).
--
-- THE REAL PIPE, transaction by transaction, exactly what aidream's provisioning service runs
-- (services/provisioning/service.py: provision -> _settle_base_contract over tables[]):
--   T1  the build, as admin@admin.com (request.jwt.claims sub): the batch answers ok; each member
--       in tables[] carries base_contract.status = pending_attach and canonical_certify_ok NULL;
--       its certify document says PENDING (never FAIL) for the three owed checks.
--   T2  per member, its own transaction: platform.provision_attach_base_contract(relation).
--   T3  per member, its own transaction: platform.provision_validate_base_contract(relation) ->
--       certified true.
--   T4  both tables carry all three base-contract foreign keys, VALIDATED, to the right parents;
--       the appeal -> claim foreign key the batch added after both existed stands; both
--       provision_spec rows share the batch_id and name admin@admin.com as the actor;
--       iam.canonical_certify_ok is true for both; the debt register says validated.
--   T5  both disposable tables are RETIRED (platform.entity_types.is_active = false, type deprecated, a note):
--       soft, never dropped.
--
-- RUN IT (the sandbox must be disabled for psql):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/provisionbatch_green.sql
--   production (the lane's live proof; builds and retires two disposable tables):
--   psql "<production>" -v ON_ERROR_STOP=1 -v expect=main -f scripts/campaign-tests/provisionbatch_green.sql
-- ITS RED: before migrations/campaign/provbatch_a_batch_owes_its_base_contract_like_one_table.sql
-- (and after its inverse) T1 prints "T1 RED" with the refusal "the batch refused certification
-- after its deferred constraints ... base_org_fk" and nothing is built.

\set ON_ERROR_STOP on
\timing off

\set suite 'provisionbatch_green.sql'
\if :{?expect}
\else
\set expect 'clone'
\endif
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

select substr(md5(clock_timestamp()::text || random()::text), 1, 6) as run,
       (select id::text from auth.users where email = 'admin@admin.com') as admin_id \gset
\echo run :run as admin@admin.com :admin_id

-- ── T1: the build ────────────────────────────────────────────────────────────────────────────
begin;
set local statement_timeout = '180s';
set local lock_timeout = '20s';
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated', 'email', 'admin@admin.com')::text, true) \g /dev/null

create or replace function pg_temp.pb_try(p jsonb) returns jsonb language plpgsql as $$
begin
  return platform.provision(p, 'runner');
exception when others then
  return jsonb_build_object('error', sqlstate || ': ' || sqlerrm);
end $$;

select pg_temp.pb_try(jsonb_build_object('tables', jsonb_build_array(
  jsonb_build_object(
    'schema', 'workbench', 'table', 'pb_claim_appeals_' || :'run', 'token', 'pb_claim_appeals_' || :'run',
    'origin', 'standard', 'type', 'entity', 'sharing', false,
    'label', 'Claim appeals', 'description', 'Appeals Harbor Point Dental files when a carrier denies or short-pays a claim.',
    'category_label', 'Dental practice',
    'taxonomy_node_id', (select id::text from platform.taxonomy_node order by slug limit 1),
    'access', jsonb_build_object('data_class', 'organization', 'data_class_reason', 'appeals belong to the practice',
                                 'default_list_scope', 'organization', 'visibility', 'internal', 'key_column', 'created_by'),
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'claim_id', 'type', 'uuid', 'not_null', true,
                         'references', jsonb_build_object('target', 'pb_insurance_claims_' || :'run', 'on_delete', 'cascade'),
                         'relationship_kind', 'composition', 'relationship_note', 'an appeal exists only for the claim it contests'),
      jsonb_build_object('name', 'reason', 'type', 'text', 'not_null', true),
      jsonb_build_object('name', 'filed_on', 'type', 'date'))),
  jsonb_build_object(
    'schema', 'workbench', 'table', 'pb_insurance_claims_' || :'run', 'token', 'pb_insurance_claims_' || :'run',
    'origin', 'standard', 'type', 'entity', 'sharing', false,
    'label', 'Insurance claims', 'description', 'Claims Harbor Point Dental bills to patients'' dental carriers, with the amount and status.',
    'category_label', 'Dental practice',
    'taxonomy_node_id', (select id::text from platform.taxonomy_node order by slug limit 1),
    'access', jsonb_build_object('data_class', 'organization', 'data_class_reason', 'claims belong to the practice',
                                 'default_list_scope', 'organization', 'visibility', 'internal', 'key_column', 'created_by'),
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'carrier', 'type', 'text', 'not_null', true),
      jsonb_build_object('name', 'billed_cents', 'type', 'integer'),
      jsonb_build_object('name', 'status', 'type', 'text')))
)))::text as t1 \gset
drop function pg_temp.pb_try(jsonb);
commit;

select (:'t1'::jsonb ? 'error') as t1_red, left(coalesce(:'t1'::jsonb->>'error', ''), 700) as t1_error,
       coalesce((:'t1'::jsonb->>'refused')::boolean, false) as t1_refused,
       left(coalesce(:'t1'::jsonb->>'error_text', :'t1'::jsonb->>'message', :'t1'), 500) as t1_refusal \gset
\if :t1_refused
\echo 'T1 NOT REACHED — the provisioner refused before building (a stale kernel it could not heal; not this suite''s subject):' :t1_refusal
do $f$ begin raise exception 'provisionbatch_green: the provisioner refused before the batch was built (see the line above)'; end $f$;
\endif
\if :t1_red
\echo 'T1 RED — the batch refused:' :t1_error
do $f$ begin raise exception 'provisionbatch_green: FAILED (see the line above)'; end $f$;
\endif

select format('workbench.%s', 'pb_insurance_claims_' || :'run') as rel_claims,
       format('workbench.%s', 'pb_claim_appeals_' || :'run') as rel_appeals \gset

select coalesce(string_agg(problem, E'\n  - '), '') as t1_problems from (
  select 'answer not ok: ' || left(:'t1', 300) as problem where (:'t1'::jsonb->>'ok')::boolean is not true
  union all
  select 'not a batch' where (:'t1'::jsonb->>'batch')::boolean is not true
  union all
  select 'expected 2 members, got ' || jsonb_array_length(:'t1'::jsonb->'tables') where jsonb_array_length(:'t1'::jsonb->'tables') <> 2
  union all
  select format('%s: base_contract %s', m->>'token', coalesce((m->'base_contract')::text, 'absent'))
    from jsonb_array_elements(:'t1'::jsonb->'tables') m where m->'base_contract'->>'status' is distinct from 'pending_attach'
  union all
  select format('%s: canonical_certify_ok %s while pending (NULL expected)', m->>'token', m->'canonical_certify_ok')
    from jsonb_array_elements(:'t1'::jsonb->'tables') m where jsonb_typeof(m->'canonical_certify_ok') is distinct from 'null'
  union all
  select format('%s: certify says %s for %s', m->>'token', c->>'status', c->>'detail')
    from jsonb_array_elements(:'t1'::jsonb->'tables') m, jsonb_array_elements(m->'certify') c
   where split_part(coalesce(c->>'detail', ''), ':', 1) in ('base_org_fk','base_created_by_fk','base_updated_by_fk')
     and c->>'status' <> 'PENDING'
  union all
  select format('%s: certify carries %s PENDING rows (3 expected)', m->>'token',
                (select count(*) from jsonb_array_elements(m->'certify') c where c->>'status' = 'PENDING'))
    from jsonb_array_elements(:'t1'::jsonb->'tables') m
   where (select count(*) from jsonb_array_elements(m->'certify') c where c->>'status' = 'PENDING') <> 3
) p \gset
select (:'t1_problems' <> '') as t1_bad \gset
\if :t1_bad
\echo 'T1 FAILED:' :t1_problems
do $f$ begin raise exception 'provisionbatch_green: FAILED (see the line above)'; end $f$;
\endif
\echo 'T1 PASSED — the batch built both members; each carries base_contract pending_attach, canonical_certify_ok NULL, three PENDING checks'

-- ── T2 / T3: settle each member, each call in its OWN transaction ─────────────────────────────
begin; select platform.provision_attach_base_contract(:'rel_claims')::text as a1 \gset
commit;
begin; select platform.provision_attach_base_contract(:'rel_appeals')::text as a2 \gset
commit;
begin; select platform.provision_validate_base_contract(:'rel_claims')::text as v1 \gset
commit;
begin; select platform.provision_validate_base_contract(:'rel_appeals')::text as v2 \gset
commit;
select ((:'v1'::jsonb->>'certified')::boolean is true and (:'v2'::jsonb->>'certified')::boolean is true) as t3_ok \gset
\if :t3_ok
\echo 'T2/T3 PASSED — attach then validate, each in its own transaction; both members certified'
\else
\echo 'T3 FAILED — validate answered' :v1 :v2
do $f$ begin raise exception 'provisionbatch_green: FAILED (see the line above)'; end $f$;
\endif

-- ── T4: what stands ──────────────────────────────────────────────────────────────────────────
select coalesce(string_agg(problem, E'\n  - '), '') as t4_problems from (
  select format('%s.%s: %s validated foreign key(s) to %s (1 expected)', rel, col, n, parent) as problem from (
    select r.rel, x.col, x.parent,
           (select count(*) from pg_catalog.pg_constraint c
              join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
             where c.conrelid = r.rel::regclass and c.contype = 'f' and c.convalidated
               and a.attname = x.col and c.confrelid = x.parent::regclass) as n
      from (values (:'rel_claims'), (:'rel_appeals')) r(rel),
           (values ('organization_id', 'iam.organizations'), ('created_by', 'auth.users'), ('updated_by', 'auth.users')) x(col, parent)
  ) q where n <> 1
  union all
  select 'the appeal -> claim foreign key the batch added is missing'
   where not exists (select 1 from pg_catalog.pg_constraint c
                       join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                      where c.conrelid = (:'rel_appeals')::regclass and c.contype = 'f'
                        and a.attname = 'claim_id' and c.confrelid = (:'rel_claims')::regclass)
  union all
  select format('%s: iam.canonical_certify_ok is not true', t)
    from (values ('pb_insurance_claims_' || :'run'), ('pb_claim_appeals_' || :'run')) v(t)
   where iam.canonical_certify_ok('workbench', t, t) is not true
  union all
  select format('provision_spec: %s rows, %s batch ids, actors %s', count(*), count(distinct batch_id), string_agg(distinct coalesce(applied_actor::text, 'null'), ','))
    from platform.provision_spec
   where token in ('pb_insurance_claims_' || :'run', 'pb_claim_appeals_' || :'run')
  having count(*) <> 2 or count(distinct batch_id) <> 1 or bool_or(batch_id is null)
      or bool_or(applied_actor is distinct from (:'admin_id')::uuid)
  union all
  select format('debt register: %s not validated', relation)
    from platform.provision_base_contract_pending
   where relation in (:'rel_claims', :'rel_appeals') and (attached_at is null or validated_at is null)
) p \gset
select (:'t4_problems' <> '') as t4_bad \gset
\if :t4_bad
\echo 'T4 FAILED:' :t4_problems
do $f$ begin raise exception 'provisionbatch_green: FAILED (see the line above)'; end $f$;
\endif
\echo 'T4 PASSED — both tables carry organization_id / created_by / updated_by foreign keys, validated, to iam.organizations and auth.users; appeal -> claim stands; one batch_id; actor admin@admin.com; both certified'

-- ── T5: retire the two disposable tables (soft; never dropped) ──────────────────────────────
begin;
set local lock_timeout = '20s';
update platform.entity_types
   set is_active = false,
       type = 'deprecated',   -- the Doctrine's retired type (REC-55); the registry's own check derives it from is_active
       custom_fields_enabled = false,   -- entity_types_custom_fields_follow_type: only entity/detail carry them
       notes = coalesce(notes || E'\n', '') || 'Retired ' || now()::date || ' by lane PROVISION-BATCH-FIX: a disposable table built by scripts/campaign-tests/provisionbatch_green.sql to prove a two-table batch certifies. Soft-retired, never dropped.'
 where token in ('pb_insurance_claims_' || :'run', 'pb_claim_appeals_' || :'run');
select count(*) as retired from platform.entity_types
 where token in ('pb_insurance_claims_' || :'run', 'pb_claim_appeals_' || :'run') and not is_active \gset
commit;
\echo 'T5 retired' :retired 'disposable table(s):' :rel_claims :rel_appeals
\echo 'ALL PASSED — provisionbatch_green.sql'
