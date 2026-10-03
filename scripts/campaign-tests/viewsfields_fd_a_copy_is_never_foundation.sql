-- LANE 10 VIEWS-AND-FIELDS, sublane FD — A COPY OF A FOUNDATION TABLE IS NEVER FOUNDATION (P3).
--
-- OWNER: lane 10 VIEWS-AND-FIELDS (sublane FD) owns this suite and the rule it holds: the copy rule
-- in custom._table_shape_guard (migrations/campaign/viewsfields_fd_a_table_can_be_marked_foundation.sql).
-- The door it walks, custom.table_duplicate, belongs to lane TABLE-ACTIONS
-- (migrations/campaign/tableactions_a_table_can_be_duplicated.sql). Until that file reaches a
-- database, this suite SKIPS there (the `requires` line below) — it runs wherever the door exists.
--
-- THE USE CASE. Dr. Ana Whitfield (admin@admin.com) runs Cedar Ridge Physical Therapy. Her
-- Therapists table is Foundation — day-one data the clinic is built on. She duplicates it to try a
-- new layout. The copy is a working copy, not the clinic's day-one table: it must arrive unmarked,
-- and her original must stay marked.
--
-- WHAT MUST HOLD:
--   · the copy exists as a Table of the clinic (table_duplicate inserts it with kept_for "copying" —
--     the guard's copy path — and hands it over in the same call when it carries no rows);
--   · the copy does not carry the Foundation mark;
--   · the source table is still Foundation;
--   · the source table, read through the member door (custom.table_facts), still says Foundation.
--
-- RED with the guard's four copy-rule lines taken out (the copy arrives marked), GREEN with them.
-- Runs in one transaction and rolls back; one row per check and a last line `fd-copy: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'viewsfields_fd_a_copy_is_never_foundation.sql'
\set requires 'grant:authenticated:custom.table_duplicate|grant:authenticated:custom.table_from_example|grant:authenticated:custom.record_update|function:custom.table_is_foundation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '14s';

create temp table fd (k text primary key, v uuid) on commit drop;
create temp table fd_out (n serial, check_name text, want text, got text) on commit drop;
grant select, insert on fd, fd_out to authenticated;
grant usage on sequence fd_out_n_seq to authenticated;

-- ANA'S SEAT — she makes Therapists, marks it Foundation, and duplicates it.
do $ana$
declare
  v_org  constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  v_home constant uuid := '80981e9d-4a5d-5d5d-8abf-5a207afe7244';   -- its Home
  v_src  uuid;
  v_copy uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_src := (custom.table_from_example(v_org, v_home, jsonb_build_object(
    'business', 'Cedar Ridge Physical Therapy',
    'tables', jsonb_build_array(jsonb_build_object(
      'token', 'therapist_copy_proof', 'name', 'Therapists (copy proof)',
      'labelSingular', 'Therapist', 'labelPlural', 'Therapists', 'type', 'entity', 'display', 'list',
      'weight', 'light', 'ordered', false, 'titleField', 'full_name',
      'describes', 'The physical therapists at Cedar Ridge',
      'fields', jsonb_build_array(jsonb_build_object('key', 'full_name', 'label', 'Full name', 'parityType', 'text')),
      'rows', '[]'::jsonb)))) -> 'tables' -> 0 ->> 'table_id')::uuid;
  perform custom.record_update(v_org, v_src, '{"foundation": true}'::jsonb);
  v_copy := (custom.table_duplicate(v_src, false, 'Therapists (copy proof, working copy)', v_org) -> 'table' ->> 'id')::uuid;
  insert into fd values ('org', v_org), ('src', v_src), ('copy', v_copy);
  insert into fd_out (check_name, want, got)
    select 'member door: the source still says Foundation', 'true', f.foundation::text
      from custom.table_facts(v_org) f where f.table_id = v_src;
  perform set_config('role', 'postgres', true);
end $ana$;

-- WHAT THE STORE HOLDS.
insert into fd_out (check_name, want, got)
  select 'the copy exists as a Table of the clinic', 'Therapists (copy proof, working copy)', coalesce(r.data ->> 'name', '(none)')
    from custom.record r where r.id = (select v from fd where k = 'copy') and r.table_id = custom.table_kernel_id()
     and r.organization_id = (select v from fd where k = 'org') and r.deleted_at is null;
insert into fd_out (check_name, want, got)
  select 'the copy does not carry the Foundation mark', 'false', custom.table_is_foundation(r.data)::text
    from custom.record r where r.id = (select v from fd where k = 'copy');
insert into fd_out (check_name, want, got)
  select 'the source is still Foundation', 'true', custom.table_is_foundation(r.data)::text
    from custom.record r where r.id = (select v from fd where k = 'src');

select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end as verdict
  from fd_out order by n;
select format('fd-copy: %s of %s checks hold', count(*) filter (where want = got), count(*)) from fd_out;
rollback;
