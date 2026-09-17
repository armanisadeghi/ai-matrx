-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W1-V1-FIXES, FINDING 5 — THE PLATFORM'S OPTIMISTIC-CONCURRENCY CONTRACT BECOMES THIS
-- STORE'S RULE, THE WAY THAT CONTRACT SAYS.
--
-- WHAT WAS MEASURED, AND WHAT IT ACTUALLY SHOWED
-- ----------------------------------------------
-- `V1-MODEL` watched two live sessions and reported B blocking 4.93 s on A's row lock and
-- then reading `version` 2 rather than 3 - but A had ROLLED BACK, so the both-COMMIT case
-- was never proven and that seat correctly declined to claim it. This lane proved it with
-- two real committing psql processes (`scripts/campaign-tests/v1_fixes_concurrency.sh`
-- PART 1): **version 1 -> 2 -> 3, B's value standing**. Both writes count; neither is lost
-- from the count. What IS lost is A's VALUE: B overwrote it without ever seeing it, and
-- nothing anywhere said so.
--
-- SO THE DEFECT IS NOT A COUNTING BUG. Last-write-wins is the platform's deliberate default
-- - `common-docs/systems/platform/optimistic-concurrency/FEATURE.md`: "Opt-in per write,
-- never automatic ... a write that does not declare a base revision keeps last-write-wins
-- semantics, byte-identical to before this contract existed", because `platform._touch_row`
-- bumps `version` on EVERY update and auto-guarding would raise spurious conflicts
-- platform-wide. The defect is that this store offered a writer NO WAY TO OPT IN. It has one
-- now, and it is the platform's, not a second invention.
--
-- WHAT THE CONTRACT SAYS, AND WHAT THIS FUNCTION DOES ABOUT EACH CLAUSE
-- ---------------------------------------------------------------------
--   · "The revision token is the canonical `version` integer column" - it is. `custom.record`
--     carries `version` maintained by `platform._touch_row`. Never `updated_at`, never xmin.
--   · "The write ... adds WHERE version = N" - the UPDATE below does exactly that, and the
--     row lock makes it a compare-and-swap rather than a check-then-write.
--   · "on 0 rows classifies by a PK-only committed re-read: row gone -> DoesNotExist; row
--     changed -> conflict" - both arms are here, and they are distinguishable by SQLSTATE.
--   · "THE DECISION PACKAGE: the loser gets a decision, not an error" - the conflict carries
--     `expected_version`, `current_version` and `contested_fields` (the CURRENT values of
--     ONLY the keys this write attempted - never a dump of the row), in DETAIL as one jsonb
--     object, so a merge UI needs no second fetch.
--   · "Nested JSON: a jsonb column counts as ONE field. No intra-JSON merging in this
--     contract" - so this is whole-record CAS over the document. The patch is merged onto the
--     stored document (`data || patch`) because that is what a caller means by a partial
--     write, but the GUARD is the whole row's version, exactly as the contract requires.
--   · "Resolution is just another write" - there is no resolution endpoint, no queue and no
--     new table. The loser resubmits against `current_version`.
--
-- SQLSTATE `PT409`, AND WHY NOT `40001`. The obvious choice is `40001`
-- (serialization_failure), and it is wrong here: poolers, ORMs and retry middleware treat
-- class 40 as "retry this transaction", and a blind retry of a stale write is precisely what
-- this contract exists to prevent - the loser must DECIDE, not repeat. PostgREST maps a
-- SQLSTATE of the form `PTnnn` to HTTP status nnn, so `PT409` is the same 409 the platform's
-- own HTTP half already returns for `version_conflict`. One condition, one status, no
-- translation layer.
--
-- THE PROOF is `scripts/campaign-tests/v1_fixes_concurrency.sh`, two real processes, both
-- committing, PART 1 and PART 2 requiring OPPOSITE outcomes over the same two sessions and
-- the same row.
--
-- THE INVERSE: `migrations/inverse/w1_v1_fixes_optimistic_concurrency_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';


create function custom.record_update(p_organization_id uuid,
                                     p_record_id uuid,
                                     p_patch jsonb,
                                     p_expected_version integer default null)
  returns integer
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $fn_ru$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  -- THE DOOR, and it is the same ONE predicate every other door in this schema calls. This
  -- is SECURITY DEFINER, so `current_user` in here is already the definer;
  -- `custom.assert_store_door` judges `custom.caller_role()` instead.
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins. The contract is explicit that this must stay
  -- byte-identical, because version moves on every background stamp too.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    return v_new;
  end if;

  -- 0 ROWS: classify by a committed re-read on the key alone, exactly as the contract says.
  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  -- THE DECISION PACKAGE: the CURRENT values of ONLY the keys this write attempted.
  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end;
$fn_ru$;

comment on function custom.record_update(uuid, uuid, jsonb, integer) is
  'The guarded write door into custom.record. With p_expected_version it is a compare-and-swap over the canonical version column - the platform''s optimistic-concurrency contract, opt-in per write - and a lost swap raises PT409 (HTTP 409 through PostgREST) carrying expected_version, current_version and the current values of only the contested fields. Without it, last-write-wins, byte-identical to a direct UPDATE. Returns the version the write landed at.';

-- THE ACCESS DECISION, IN DATA, IN THIS SAME TRANSACTION. A SECURITY DEFINER function runs
-- as the owner, so `platform._provision_shape_settled` refuses at COMMIT unless somebody has
-- said who may call it. Same lane as custom.record_write's row, and the same answer.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'record_update',
   'p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer',
   array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'int4'::regtype]::oid[],
   'W1-V1-FIXES / V1-MODEL finding 5: the guarded write door into custom.record. p_organization_id and p_record_id are the store''s composite key and are BOTH required - a null in either is refused 22004, and a record belonging to another organization is simply not found, never updated. p_patch is refused unless it is a jsonb object. p_expected_version is the caller''s declared base revision and is optional by the platform contract''s own opt-in rule; when present the UPDATE carries `and version = p_expected_version`, so a stale write lands nothing and raises PT409 with the decision package. The store door (custom.assert_store_door) runs first, so while custom/system_enabled resolves false only the role that owns custom.record reaches any of it.',
   'migrations/campaign/w1_v1_fixes_optimistic_concurrency.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false; the campaign''s own server lanes reach it as postgres. The client grant is switch-checklist work with its own step, never a lane''s.',
   false, false)
on conflict do nothing;
