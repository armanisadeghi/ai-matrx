-- chair-step: lane NIGHT-WINDOW-0930 (2026-09-30). Regenerates the policies of custom.record and its 14 sibling custom.* tables through iam.apply_rls, so the organization-member arm of each std_select carries the SHARED-ONLY member-knob guard `(not custom.store_is_open(organization_id) or iam.member_lane_open(organization_id))` the generator has emitted since 2026-09-19 (STORE-READ-PERF-2 generator census, 2026-09-27: 15 custom.* tables differ from the generator by exactly that guard). No client role holds a table privilege in schema custom (census 7), so no real read moves; the change is a permission-shaped narrowing, so it waits for a watched production window. The sign-in freeze is taken once, first, through iam.take_sign_in_freeze (1 ms waits, refuses 55P03 by name), and held to COMMIT: commit promptly.
-- lane: NIGHT-WINDOW-0930
-- window-class: 15 policy regenerations in one transaction; the supautils policy hook holds ACCESS EXCLUSIVE on auth.users and 22 more sign-in/storage/realtime relations from the first statement to COMMIT (clone timings in common-docs/projects/data-doctrine-adoption/v5/PROGRESS-NIGHT-WINDOW-0930.md); apply only with Arman watching
-- lock: custom,iam
-- policy-ddl: fifteen tables

set local lock_timeout = '3s';

do $$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'Nothing was changed: the access kernel fingerprint is stale, so iam.apply_rls would emit the unbounded read lane. Match the kernel first.';
  end if;
end $$;

select iam.take_sign_in_freeze('custom.record'::regclass, 'NIGHT-WINDOW-0930: custom.* read policies carry the member-knob guard');

select iam.apply_rls('custom', 'anon_form', 'anon_form', 'entity');
select iam.apply_rls('custom', 'anon_hit', 'anon_hit', 'entity');
select iam.apply_rls('custom', 'anon_inbound', 'anon_inbound', 'entity');
select iam.apply_rls('custom', 'anon_replay', 'anon_replay', 'entity');
select iam.apply_rls('custom', 'anon_submission', 'anon_submission', 'entity');
select iam.apply_rls('custom', 'anon_token', 'anon_token', 'entity');
select iam.apply_rls('custom', 'doc_render', 'doc_render', 'entity');
select iam.apply_rls('custom', 'doc_signature', 'doc_signature', 'entity');
select iam.apply_rls('custom', 'external_link', 'external_link', 'entity');
select iam.apply_rls('custom', 'external_source', 'external_source', 'entity');
select iam.apply_rls('custom', 'io_comment', 'io_comment', 'entity');
select iam.apply_rls('custom', 'io_import', 'io_import', 'entity');
select iam.apply_rls('custom', 'io_outbox', 'io_outbox', 'entity');
select iam.apply_rls('custom', 'merge_field_provenance', 'merge_field_provenance', 'entity');
select iam.apply_rls('custom', 'record', 'record', 'entity');
