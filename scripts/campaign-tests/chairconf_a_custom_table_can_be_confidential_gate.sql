-- LANE CHAIR-CONFIDENTIAL-STORE — WHOM A CONFIDENTIAL TABLE NAMES CHANGES ONLY WITH ARMAN'S APPROVAL.
--
-- The companion to chairconf_a_store_table_can_be_confidential_proof.sql for the one check a single
-- transaction cannot show: an approval stands for the rest of its own transaction and the approval
-- ledger is append-only. So: (1) Cedar Ridge Physical Therapy's "Performance reviews" Table is made
-- Confidential with Arman's words and COMMITTED; (2) in a new transaction, adding "Summary" to the
-- people it names without approval is refused, and dropping the level (back to Organization) is not;
-- (3) the fixture organization is archived. Prints `chairconf-gate: N of 2 checks hold`.
-- RED before the change (both writes land), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairconf_a_store_table_can_be_confidential_gate.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- The transaction pooler gives each transaction its own backend, so the fixture's id travels as a psql
-- variable and reaches each transaction as a transaction-local setting (never a session SET).
select gen_random_uuid() as chairconf_org \gset

begin;
select set_config('chairconf.org', :'chairconf_org', true);
do $fixture$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid := current_setting('chairconf.org')::uuid; v_home uuid; v_t uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairconf-gate', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8), 'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'chairconf gate fixture');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Clinic')) returning id into v_home;
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Performance reviews', 'slug', 'performance_reviews', 'type', 'entity',
    'label_singular', 'Performance review', 'label_plural', 'Performance reviews',
    'title_field', 'period', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'period'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'period', 'label', 'Review period', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'manager', 'label', 'Manager', 'type', 'relation', 'relation_target', '11111111-0000-4000-8000-000000000005', 'relation_max', 1, 'sort', 20));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'summary', 'label', 'Summary', 'type', 'text', 'sort', 30));
  if to_regprocedure('custom.set_table_confidential_arman_explicitly_approved(uuid, jsonb, text, date)') is not null then
    execute 'select custom.set_table_confidential_arman_explicitly_approved($1, $2, $3, current_date)'
      using v_t, '[{"field":"manager","level":"editor"}]'::jsonb,
            'Yes, make the performance reviews table Confidential: only the writer and the manager may read a review.';
  else
    update custom.record set data = data || '{"level":"confidential","readers":[{"field":"manager","level":"editor"}]}'::jsonb
     where organization_id = v_org and id = v_t;
  end if;
end $fixture$;
commit;

begin;
select set_config('chairconf.org', :'chairconf_org', true);
create temp table ccg_out (n serial, check_name text, want text, got text) on commit drop;
do $later$
declare v_org uuid; v_t uuid; v_got text;
begin
  v_org := current_setting('chairconf.org')::uuid;
  select t.id into v_t from custom.record t where t.organization_id = v_org and t.table_id = custom.table_kernel_id() and t.data ->> 'slug' = 'performance_reviews' and t.deleted_at is null;
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  begin
    update custom.record set data = jsonb_set(data, '{readers}', '[{"field":"manager","level":"editor"},{"field":"summary"}]'::jsonb)
     where organization_id = v_org and id = v_t;
    v_got := 'written';
  exception when others then
    v_got := 'refused ' || coalesce(nullif(sqlstate, ''), '?');
  end;
  insert into ccg_out (check_name, want, got) values ('a later, unapproved change of whom it names', 'refused 42501', v_got);
  begin
    update custom.record set data = (data - 'level') - 'readers' where organization_id = v_org and id = v_t;
    v_got := case when (select data ? 'level' from custom.record where organization_id = v_org and id = v_t) then 'still confidential' else 'written' end;
  exception when others then
    v_got := 'refused ' || sqlerrm;
  end;
  insert into ccg_out (check_name, want, got) values ('a later move back to Organization, no approval', 'written', v_got);
end $later$;
select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end verdict from ccg_out order by n;
select format('chairconf-gate: %s of %s checks hold', count(*) filter (where want = got), count(*)) from ccg_out;
rollback;

-- The fixture organization is archived (delete means archive), and so is closed to everyone.
begin;
update iam.organizations set archived_at = now() where id = :'chairconf_org';
commit;
