-- LANE MIRROR-2 — THE GREEN SUITE, ONE SEAT PER CONNECTION.
--
-- RUN IT TWICE, ONCE PER SEAT, ON A FRESH CONNECTION EACH TIME:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=admin -f scripts/campaign-tests/mirror2_green.sql
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=dana  -f scripts/campaign-tests/mirror2_green.sql
--
-- WHAT IT PROVES. The RLS mirror on `custom.record` asks `custom.visible_set` about the ROW'S
-- OWN organization, once per statement, and names exactly the rows the whole-database set named.
--
-- WHAT MAKES IT FAIL — the production change, one per part:
--   PART 1 — run the inverse of file 2 and the policy goes back to the whole-database bound:
--            2a and 2d go red.
--   PART 2 — run the inverse of file 1 and `iam.record_visible_in_org` is gone: every clause
--            below 2a goes red and `custom.record` stops being readable at all.
-- Its red twin is `scripts/campaign-tests/mirror2_red.sql`, which executes those real bytes.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'mirror2_green.sql'
-- SUITES-TIDY-2 2026-09-22 — ONE CLAUSE IS SIZE-AWARE, NOT THE WHOLE FILE. This file used to
-- declare `compute:shared_buffers:524288` at FILE level, so on the nightly dev clone (production's
-- data on smaller compute — measured 2026-09-22: shared_buffers 2 GB against production's 4 GB,
-- effective_cache_size 6 GB against 12 GB, 2 parallel workers against 4) the preamble printed
-- SKIPPED and NOTHING here asserted: not the seat proof, not the product doors, not the policy
-- text, not the fence. Exactly ONE clause needs production's compute — 2b, which evaluates
-- `iam.accessible_entity_ids('record', …)` over the WHOLE DATABASE under a 60-second ceiling —
-- so exactly that clause is gated now, it says out loud when it did not measure, and the file
-- emits a top-level SKIPPED line the sweep's judge reads. Everything else runs on the clone.
-- Do not answer a skip here by raising the ceiling: the ceiling is the assertion.
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- 🚨 RED-SUITES 2026-09-21 — A SUITE THAT NEEDS AN ARGUMENT SAYS SO AND THEN SUPPLIES ONE.
-- This file reads `:'seat'`, which psql substitutes BEFORE the server sees the line, so a run
-- without `-v seat=…` dies on `syntax error at or near ":"` — an error about psql's own
-- substitution that reads like a bug in the SQL. VERIFIER-8 Part C filed this file (and two
-- siblings) as a BROKEN SUITE on exactly that sentence; the file was never broken, the run was
-- missing an argument and nothing said so. It now defaults to the `admin` seat — the seat the
-- header's first example names — and a run that means the other one still passes `-v seat=dana`.
\if :{?seat}
\else
  \set seat admin
  \echo '[RED-SUITES] no -v seat=… given; running the admin seat. The other seat is -v seat=dana.'
\endif
\timing off

-- SUITES-TIDY-2 2026-09-22 — the size probe for clause 2b only (see the header).
select case when (select setting::numeric from pg_settings where name = 'shared_buffers') >= 524288
            then 'false' else 'true' end as mirror2_green_small_server
\gset

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

select set_config('mirror2.seat', :'seat', true);

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_seat    text := current_setting('mirror2.seat', true);
  v_me      uuid;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_shared  uuid;
  v_private uuid;
  v_boss    text := current_user;
  v_msg     text;
  v_qual    text;
  v_n       integer;
  v_e1      text;
  v_e2      text;
  v_memo    uuid[];
  v_whole   uuid[];
begin
  if v_seat not in ('admin', 'dana') then
    raise exception 'mirror2_green.sql needs -v seat=admin or -v seat=dana, not %', v_seat;
  end if;
  v_me := case when v_seat = 'admin' then c_admin else c_dana end;

  ---------------------------------------------------------------------------------------------
  -- FIXTURES, as the connected role.
  ---------------------------------------------------------------------------------------------
  perform set_config('app.actor_system', 'campaign-test/mirror2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software — Austin Studio', 'meridian-austin-' || substr(v_org::text, 1, 8), 'MSA', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'mirror2_green');
  -- SHARED_ONLY is the setting this lane is judged under: under `all_records` the mirror's
  -- organization-member arm answers first and the bounded arm this lane rewrote never runs.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'mirror2_green');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Deliverables', 'slug', 'deliverables', 'type', 'entity',
    'label_singular', 'Deliverable', 'label_plural', 'Deliverables', 'title_field', 'tname',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'tname')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','tname','label','Name','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl));

  v_shared  := custom.record_write(v_org, v_tbl, jsonb_build_object('tname', 'Shared with Dana'));
  v_private := custom.record_write(v_org, v_tbl, jsonb_build_object('tname', 'Nobody shared this'));
  perform custom.share_grant(v_org, v_shared, 'user', c_dana, 'viewer'::public.permission_level);

  ---------------------------------------------------------------------------------------------
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  ---------------------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims',
                     case when v_seat = 'admin' then c_admin_j else c_dana_j end, true);
  raise notice '0: seated as authenticated, claims = %', v_seat;

  ---------------------------------------------------------------------------------------------
  -- PART 1 — THE PRODUCT ANSWER DID NOT MOVE. The doors are what a person reaches; if the
  -- mirror's new arm changed an answer by one row, these are the clauses that say so.
  ---------------------------------------------------------------------------------------------
  if v_seat = 'admin' then
    select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 200, 0);
    if v_n <> 2 then
      raise exception '1a: the owner reads % rows of her own Table, expected 2', v_n;
    end if;
    raise notice '1a: the owner reads both rows of her Table through custom.read_records.';

    if custom.my_level(v_org, v_private) is distinct from 'admin'::public.permission_level then
      raise exception '1b: custom.my_level answered % for the owner', custom.my_level(v_org, v_private);
    end if;
    raise notice '1b: custom.my_level answers admin for the owner — the halving still climbs.';
  else
    -- THE CONTROL SHE CAN DO.
    if custom.read_record(v_org, v_shared, true) is null then
      raise exception '1c: the record shared with her at viewer did not read back';
    end if;
    raise notice '1c: the one record shared with her at viewer reads back through custom.read_record.';

    if custom.my_level(v_org, v_shared) is distinct from 'viewer'::public.permission_level then
      raise exception '1d: custom.my_level answered % for a viewer share',
        custom.my_level(v_org, v_shared);
    end if;
    raise notice '1d: custom.my_level answers viewer for the record shared with her.';

    -- THE NEGATIVE.
    begin
      perform custom.read_record(v_org, v_private, true);
      raise exception '1e: she read a record nobody shared with her';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
    end;
    raise notice '1e: a record she may not open is refused at 42501 — "%"', v_msg;
  end if;

  ---------------------------------------------------------------------------------------------
  -- PART 2 — THE MIRROR'S OWN ARM. NO CLIENT DOOR COVERS A CATALOGUE QUESTION, so the suite
  -- steps OUT for 2a and 2d and says so, and asserts no product clause while out. 2b and 2c
  -- are asked from the SEAT, because `iam.record_visible_in_org` is a declared signed-in door
  -- and the whole point is what it answers for the person sitting there.
  ---------------------------------------------------------------------------------------------
  perform set_config('role', v_boss, true);

  select p.qual into v_qual from pg_policies p
   where p.schemaname = 'custom' and p.tablename = 'record' and p.policyname = 'std_select';
  if v_qual !~ 'record_visible_in_org' then
    raise exception '2a: the policy on custom.record does not ask about the row''s organization';
  end if;
  if v_qual ~ 'accessible_entity_ids\(''record''' then
    raise exception '2a: the policy on custom.record still computes the whole-database record set';
  end if;
  raise notice '2a: the mirror asks iam.record_visible_in_org and no longer names the whole-database set.';

  select count(*) into v_n from custom.mirror_asks_the_whole_database();
  if v_n <> 0 then
    raise exception '2d: % polic(ies) still compute the whole-database record set', v_n;
  end if;
  raise notice '2d: policies still computing the whole-database record set - none.';

  -- 2b — THE SAME ROWS. Still stepped OUT, and it has to be: `custom.record` carries no SELECT
  -- for any client role (the store is closed and every client reach is a door), so the mirror's
  -- own arm cannot be evaluated over rows from the seat at all. The CLAIMS are the seat's, so
  -- both sides still answer for that person — `iam.record_visible_in_org` and
  -- `iam.accessible_entity_ids` both read `auth.uid()` and neither takes a principal. The organization-bounded memo and the whole-database set name exactly
  -- the same rows of this organization for this seat, in ONE snapshot.
  -- SUITES-TIDY-2 2026-09-22 — THIS is the clause that needs production's compute: the second
  -- half computes `iam.accessible_entity_ids` over EVERY organization on the database under the
  -- 60-second ceiling. The comparison IS the assertion, so both halves stand or fall together;
  -- neither a `\if` NOR a psql variable can reach inside a dollar-quoted DO block (psql does
  -- not interpolate there at all), so the block asks pg_settings itself, exactly as the teardown
  -- of sharedonly_green.sql does. The top-level `\gset` probe below drives the SKIPPED line.
  if (select setting::numeric from pg_settings where name = 'shared_buffers') < 524288 then
    raise notice '2b: NOT MEASURED — the whole-database set (iam.accessible_entity_ids) needs compute:shared_buffers:524288 and this server is smaller. No memo/whole-database comparison was made.';
  else
  select array_agg(r.id order by r.id) into v_memo
    from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and iam.record_visible_in_org(r.organization_id, r.table_id, r.id, r.visibility, r.created_by,
                                   'viewer'::public.permission_level);
  select array_agg(r.id order by r.id) into v_whole
    from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and r.id = any (iam.accessible_entity_ids('record', 'viewer'::public.permission_level, 0, true));
  if coalesce(v_memo, '{}'::uuid[]) is distinct from coalesce(v_whole, '{}'::uuid[]) then
    raise exception '2b: the organization-bounded memo and the whole-database set disagree for % — memo %, whole %',
      v_seat, coalesce(array_length(v_memo,1),0), coalesce(array_length(v_whole,1),0);
  end if;
  raise notice '2b: the memo and the whole-database set name the same % row(s) for % in this organization.',
    coalesce(array_length(v_memo,1),0), v_seat;
  end if;

  perform set_config('role', 'authenticated', true);

  -- 2c(i) — THE FENCE, INSIDE ONE STATEMENT, back in the seat. Two calls in one SELECT must
  -- see ONE epoch, or the memo would be recomputed for every row the policy judges.
  select string_agg(e, '|') into v_e1 from (select iam.statement_memo_epoch() as e
                                              from generate_series(1, 2)) z;
  if split_part(v_e1, '|', 1) is distinct from split_part(v_e1, '|', 2) then
    raise exception '2c(i): two calls in ONE statement saw different epochs (%)', v_e1;
  end if;
  perform set_config('mirror2.e1', split_part(v_e1, '|', 1), true);
  raise notice '2c(i): two calls inside one statement see one epoch, so the set is computed once.';

end;
$t$;

-- 2c(ii) — AND THE NEXT CLIENT STATEMENT GETS A NEW ONE. This cannot be asserted inside the
-- block above: a DO block IS one client statement, so `statement_timestamp()` — correctly — does
-- not move inside it. The fence is per CLIENT statement, which is what "once per statement"
-- means, so the clause is written as a second client statement.
do $t2$
declare v_seat text := current_setting('mirror2.seat', true);
begin
  if iam.statement_memo_epoch() = current_setting('mirror2.e1', true) then
    raise exception '2c(ii): a NEW client statement reused the previous statement''s epoch (%) — the memo is not statement-scoped',
      current_setting('mirror2.e1', true);
  end if;
  raise notice '2c(ii): a new client statement gets a new epoch — nothing the memo holds survives a statement.';
  if (select setting::numeric from pg_settings where name = 'shared_buffers') < 524288 then
    raise notice 'MIRROR-2 GREEN (seat %): every clause PASSED except 2b, which did not measure on this server.', v_seat;
  else
    raise notice 'MIRROR-2 GREEN (seat %): ALL PARTS PASSED.', v_seat;
  end if;
end;
$t2$;

rollback;

\if :mirror2_green_small_server
\echo 'SKIPPED: mirror2_green.sql clause 2b (the organization-bounded memo against the whole-database set) asserted nothing. This database does not have: compute:shared_buffers:524288'
\echo 'SKIPPED: clause 2b is the only one gated. PART 0 (the seat proof), PART 1 (1a/1b for the admin seat, 1c/1d/1e for the dana seat), 2a and 2d (the policy text and the whole-database-policy census) and 2c(i)/2c(ii) (the statement fence) DID run and DID assert. This is NOT a pass.'
\endif
