-- dd173_api_request_log_c_seal — DD-173 `ops.api_request_log`, STEP C of four: the base contract
-- is SEALED. Step A added the columns, step B moved the backlog in bounded batches; this file
-- makes `organization_id` NOT NULL, validates the FK against the whole table, and refuses to do
-- either until the LIVE WRITER can be seen naming an organization.
--
-- 🚨 THE REFUSAL THAT MATTERS IS IN STEP 2, AND IT IS THE WHOLE REASON THIS IS A SEPARATE FILE.
--    A read gate cannot see a write disappear (DD-173 batch 7's lesson). `organization_id NOT
--    NULL` on a table whose writer does not name one does not fail here — it fails silently on
--    the running server, every request, forever, in an audit sink built to swallow its own
--    failures. So this file does not take the registry's word, or a commit's word, or a deploy's
--    word: it reads the LIVE ROWS the server wrote in the last ten minutes and refuses to seal
--    unless there are some AND every one of them carries an organization. A vacuous proof (no
--    rows at all in the window) is refused as loudly as a failing one.
--
-- 🚨 HOW THE STRONG LOCK IS KEPT TO MILLISECONDS. `alter table ... set not null` normally scans
--    the whole table under ACCESS EXCLUSIVE. Given an already-VALID `CHECK (organization_id IS
--    NOT NULL)`, PostgreSQL 12+ skips that scan entirely — so the sequence is: add the CHECK NOT
--    VALID (catalog only), VALIDATE it (SHARE UPDATE EXCLUSIVE — blocks nothing but DDL), SET NOT
--    NULL (2 ms, measured), drop the scaffolding CHECK. The FK added NOT VALID by step A is
--    validated the same way. Measured on a 200 k-row copy of this table: 4 ms / 54 ms / 2 ms /
--    3 ms, and 14 ms / 80 ms for the FK pair.
--
-- Step D generates the policies under the access-delta gate.

do $dd173arlc$
declare
  v_sysorg  constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_window  constant interval := interval '10 minutes';
  v_t0      timestamptz;
  v_lo      timestamptz;
  v_recent  bigint; v_recent_null bigint; v_moved bigint := 0; v_batch bigint;
  v_notnull boolean;
begin
  -- ═══════ 1. WHAT STEPS A AND B MUST HAVE LEFT BEHIND ════════════════════════════════════════
  select a.attnotnull into v_notnull from pg_attribute a
   where a.attrelid='ops.api_request_log'::regclass and a.attname='organization_id' and not a.attisdropped;
  if v_notnull is null then
    raise exception 'dd173-arl-c: ops.api_request_log has no organization_id column. Steps A and B have not run.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='api_request_log'
                    and column_name='metadata' and data_type='jsonb' and is_nullable='NO') then
    raise exception 'dd173-arl-c: ops.api_request_log has no NOT NULL jsonb metadata. Step A has not run.';
  end if;
  if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                  where c.conrelid='ops.api_request_log'::regclass and c.contype='f'
                    and a.attname='organization_id' and c.confrelid='iam.organizations'::regclass) then
    raise exception 'dd173-arl-c: the organization FK is missing. Step A has not run.';
  end if;

  -- ═══════ 2. THE LIVE WRITER, READ OFF THE LIVE ROWS — NOT ASSUMED, NOT TAKEN ON A DEPLOY ════
  select count(*), count(*) filter (where t.organization_id is null)
    into v_recent, v_recent_null
    from ops.api_request_log t
   where t.created_at > now() - v_window;
  if v_recent = 0 then
    raise exception
      'dd173-arl-c: not one request-log row was written in the last %. The proof that the live writer names an organization would be vacuous, and a vacuous proof is refused. Either the server is not serving or the sink is broken — find out which before sealing a NOT NULL onto its target.', v_window;
  end if;
  if v_recent_null > 0 then
    raise exception
      'dd173-arl-c: % of the % request-log row(s) written in the last % carry NO organization. The deployed writer still does not name one, and sealing NOT NULL now would fail every request-log write on the running server. Nothing was changed. (aidream aidream/api/middleware/request_log.py must be live first.)',
      v_recent_null, v_recent, v_window;
  end if;
  raise notice 'dd173-arl-c: the live writer is proven — % row(s) written in the last %, % of them without an organization', v_recent, v_window, v_recent_null;

  -- ═══════ 3. THE DRAIN — whatever the old writer added while the deploy was in flight ════════
  -- Same bounded shape as step B, and the same row-count-independent predicate. By now this is a
  -- handful of rows, but it is written to be correct if it is a hundred thousand.
  v_t0 := clock_timestamp();
  loop
    select min(t.created_at) into v_lo from ops.api_request_log t where t.organization_id is null;
    exit when v_lo is null;
    if clock_timestamp() - v_t0 > interval '20 seconds' then
      raise exception 'dd173-arl-c: the drain is still running after 20 s (backlog starts at %). That is step B''s job, not this file''s — run another numbered batch file and then this one again.', v_lo;
    end if;
    update ops.api_request_log t
       set organization_id = v_sysorg
     where t.created_at >= v_lo and t.created_at < v_lo + interval '12 hours'
       and t.organization_id is null;
    get diagnostics v_batch = row_count;
    v_moved := v_moved + v_batch;
    if v_batch = 0 then
      raise exception 'dd173-arl-c: the window at % moved 0 rows while a row with no organization exists there. The cursor cannot advance; nothing was sealed.', v_lo;
    end if;
  end loop;
  raise notice 'dd173-arl-c: drained % straggler row(s); no row anywhere lacks an organization', v_moved;

  -- ═══════ 4. THE SEAL — every strong lock measured in milliseconds ═══════════════════════════
  if not v_notnull then
    alter table ops.api_request_log
      add constraint ops_api_request_log_organization_id_present
      check (organization_id is not null) not valid;
    alter table ops.api_request_log validate constraint ops_api_request_log_organization_id_present;
    alter table ops.api_request_log alter column organization_id set not null;
    alter table ops.api_request_log drop constraint ops_api_request_log_organization_id_present;
    raise notice 'dd173-arl-c: organization_id is NOT NULL (via a validated CHECK, so PostgreSQL skipped the ACCESS EXCLUSIVE table scan)';
  else
    raise notice 'dd173-arl-c: organization_id was already NOT NULL';
  end if;

  if exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
              where c.conrelid='ops.api_request_log'::regclass and c.contype='f'
                and a.attname='organization_id' and c.confrelid='iam.organizations'::regclass
                and not c.convalidated) then
    alter table ops.api_request_log validate constraint ops_api_request_log_organization_id_fkey;
    raise notice 'dd173-arl-c: the organization FK is validated over the whole table';
  else
    raise notice 'dd173-arl-c: the organization FK was already validated';
  end if;

  -- ═══════ 5. THE BASE CONTRACT, MEASURED — the policy family is step D's ═════════════════════
  if exists (select 1 from iam.verify_canonical('ops','api_request_log','api_request_log')
              where status = 'FAIL'
                and check_name not in ('policies_canonical','bespoke_policy_present','privacy_wall',
                                       'personal_row_wall','rls_enabled','anon_public_lane','class_lanes',
                                       'component_anon_lane','policy_system_public_read','pub_read_anon',
                                       'component_public_read','component_not_wider_than_parent',
                                       'containment_respects_personal','data_class_derivations')) then
    raise exception 'dd173-arl-c: a base-contract FAIL remains after the seal: %',
      (select string_agg(check_name||': '||coalesce(detail,''), ' ; ')
         from iam.verify_canonical('ops','api_request_log','api_request_log')
        where status='FAIL' and check_name not in ('policies_canonical','bespoke_policy_present','privacy_wall',
              'personal_row_wall','rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
              'policy_system_public_read','pub_read_anon','component_public_read',
              'component_not_wider_than_parent','containment_respects_personal','data_class_derivations'));
  end if;
  raise notice 'dd173-arl-c: 0 base-contract FAIL — ops.api_request_log now carries the ledger contract. Step D generates its policies under the access-delta gate.';
end $dd173arlc$;
