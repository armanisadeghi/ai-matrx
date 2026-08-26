-- HR L13 — migration 2 of 3 (register item HRB-025, lane lane-l13-export).
--
-- THE EXPORT GRAIN, MADE TRUE, AND THE ONE READ THE UI CANNOT OTHERWISE MAKE.
--
-- Authority: SPEC-CONTRACTS §4.1 (the grain and the two grain facts), §2.2 (export status and
-- history are a DIRECT read), §3.6 (provider credentials never reach a client);
-- FREEZE D-1 (client_excluded_columns), FREEZE D-10 (the `public.` reader precedent).
-- Applied live as `hr_l13_02_export_grain_and_reader`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 `hr.payroll_export_line` HAD NO `workweek_id`, AND THE GRAIN SAYS IT IS ON EVERY LINE.
--    SPEC-CONTRACTS §4.1 grain fact 1 is explicit — "`workweek_id` is on every line" — because a
--    semimonthly period splits a workweek, OT is computed on the whole workweek and attributed to
--    the period containing the workweek's END date, and the line-level workweek is the only thing
--    that makes that reconcilable (AR 1.5, fixture OT-BOUND-01). Readiness B5 repeats it. The live
--    table shipped without the column. Every format mapper must honour a fact the schema could not
--    carry, so the column lands here — NOT NULL, because a nullable one would be honoured by the
--    first mapper and quietly skipped by the second.
--
-- 2. NOT NULL IS SAFE AND IS THE POINT. `hr.payroll_export_line` holds zero rows (verified live),
--    so there is no backfill and no window where the column lies. An adjustment line still gets a
--    real workweek: the generator resolves it from (employment, local work date) against
--    `hr.workweek`, and a line whose workweek cannot be resolved is a BLOCKING export condition,
--    not a null. That is the whole argument for NOT NULL — the alternative is a payroll file with
--    unattributable overtime, which is the failure §4.1 exists to prevent.
--
-- 3. THE UI CANNOT READ `hr.*` AT ALL, SO THE "DIRECT" HISTORY READ NEEDS A `public.` DOOR.
--    §2.2 files "Export status and history reads" under DIRECT — `RLS on hr.payroll_export`. That
--    is not possible: `hr` is absent from `pgrst.db_schemas` on the `authenticator` role (verified
--    live), exactly as FREEZE D-10 found for `esign`. D-10's own resolution is the precedent and is
--    followed here rather than invented: a `SECURITY DEFINER` function in `public` that returns the
--    whole answer in one authorised call, the way `public.esign_envelope_state(uuid)` does.
--    Adding `hr` to the PostgREST schema list is a fleet-wide config change and not a build lane's
--    call (D-10, verbatim).
--
-- 4. THE READER IS `STABLE` AND WRITES NO AUDIT ROW, ON PURPOSE. §2.2 puts export status and
--    history in the CRUD lane, which is un-audited by design; the AUDITED export acts are the
--    artifact (E-23) and the timesheet report (E-21), and the server writes
--    `hr.access_audit action='export'` for those. A list of delivery states is not a reveal.
--    It is still capability-gated on `payroll.read` and org-membership — a denial returns
--    `{granted:false}` rather than an empty list, because an empty list and "you may not look" are
--    different answers and a screen that cannot tell them apart shows a lie.
--
-- 5. THE BINDING'S SECRET REFERENCES ARE REGISTERED CLIENT-EXCLUDED (FREEZE D-1). `credential_ref`,
--    `webhook_secret_ref` and `connector` are pointers and configuration, not material — but a
--    generated `database.types.ts` that names them teaches the next client author that they are
--    fetchable. The registry keeps them out of the emitted types; the actual boundary remains that
--    `hr` is unreachable from PostgREST and E-27 projects a fixed column list.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. The grain fact the schema could not carry (RECORDED DECISIONS 1 + 2).
-- ---------------------------------------------------------------------------------
do $$
declare v_rows bigint;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'hr' and table_name = 'payroll_export_line'
                    and column_name = 'workweek_id') then
    select count(*) into v_rows from hr.payroll_export_line;
    if v_rows > 0 then
      raise exception 'hr_l13_02: payroll_export_line holds % rows; NOT NULL workweek_id needs a backfill this file does not write', v_rows;
    end if;
    alter table hr.payroll_export_line
      add column workweek_id uuid not null references hr.workweek(id);
  end if;
end $$;

comment on column hr.payroll_export_line.workweek_id is
  'SPEC-CONTRACTS §4.1 grain fact 1 — on EVERY line, including prior-period adjustment lines. A semimonthly period splits a workweek; overtime is computed on the whole workweek and attributed to the period containing its end date, and this column is what makes that reconcilable (AR 1.5, fixture OT-BOUND-01). A line whose workweek cannot be resolved blocks the export; it never lands null.';

create index if not exists payroll_export_line_workweek_idx
  on hr.payroll_export_line (organization_id, workweek_id);
create index if not exists payroll_export_line_export_idx
  on hr.payroll_export_line (payroll_export_id, employment_id, work_date);

-- ---------------------------------------------------------------------------------
-- 2. Client-excluded columns on the provider binding (RECORDED DECISION 5).
-- ---------------------------------------------------------------------------------
update platform.entity_types
   set client_excluded_columns = ARRAY['credential_ref','webhook_secret_ref','connector']
 where token = 'hr_provider_binding'
   and client_excluded_columns is distinct from ARRAY['credential_ref','webhook_secret_ref','connector'];

-- ---------------------------------------------------------------------------------
-- 3. public.hr_payroll_export_list — the history read (RECORDED DECISIONS 3 + 4).
-- ---------------------------------------------------------------------------------
create or replace function public.hr_payroll_export_list(
  p_organization_id uuid,
  p_pay_period_id   uuid default null,
  p_limit           integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_mine  uuid[];
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if v_user is null or p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'auth_required');
  end if;

  -- Org standing first: a capability is meaningless outside an org this caller works in.
  -- `hr.employments_of` is the one resolver for "which employments is this login" (it keys on
  -- hr.employee.login_user_id and honours hire/termination dates); this narrows its answer to
  -- the requested org rather than re-deriving it.
  select coalesce(array_agg(e.id), '{}'::uuid[]) into v_mine
    from hr.employment e
   where e.id = any (hr.employments_of(v_user))
     and e.organization_id = p_organization_id;

  if cardinality(v_mine) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_employment_in_organization');
  end if;

  if not hr.capability(v_user, 'payroll.read') then
    return jsonb_build_object('granted', false, 'reason', 'hr_capability_denied',
                              'capability', 'payroll.read');
  end if;

  return jsonb_build_object(
    'granted', true,
    'exports', coalesce((
      select jsonb_agg(row_to_json(x) order by x.generated_at desc)
        from (
          select pe.id                      as export_id,
                 pe.pay_period_id,
                 pp.period_start_on,
                 pp.period_end_on,
                 pp.state                   as pay_period_state,
                 pe.export_format,
                 pe.export_version,
                 pe.delivery_state,
                 pe.line_count,
                 pe.total_hours::text       as total_hours,
                 pe.total_amount::text      as total_amount,
                 pe.artifact_file_id,
                 pe.artifact_sha256,
                 pe.supersedes_export_id,
                 pe.acknowledgement_ref,
                 pe.acknowledged_at,
                 pe.sent_at,
                 pe.failure_reason,
                 pe.includes_adjustment_ids,
                 pe.generated_at,
                 coalesce((pe.metadata -> 'includes_pii')::boolean, false) as includes_pii,
                 coalesce(pe.metadata -> 'disputes_carried', '[]'::jsonb)  as disputes_carried
            from hr.payroll_export pe
            join hr.pay_period pp on pp.id = pe.pay_period_id
           where pe.organization_id = p_organization_id
             and (p_pay_period_id is null or pe.pay_period_id = p_pay_period_id)
           order by pe.generated_at desc
           limit v_limit) x), '[]'::jsonb));
end
$function$;

comment on function public.hr_payroll_export_list(uuid, uuid, integer) is
  'SPEC-CONTRACTS §2.2 — the DIRECT export status/history read, reachable from the browser because `hr` is not exposed to PostgREST (FREEZE D-10). Capability-gated on payroll.read plus org standing; returns {granted:false, reason} rather than an empty list on a denial, because "nothing here" and "you may not look" are different answers. STABLE: a status list is not a reveal and writes no audit row (§2.2 CRUD lane); the audited export acts are E-21 and E-23.';

-- `revoke ... from public` is NOT enough, and this file's own assertion caught that on the first
-- apply: `pg_default_acl` carries `postgres → public schema → functions → anon=X`, so every new
-- function in `public` is born executable by `anon` through an EXPLICIT grant that a PUBLIC revoke
-- does not touch. A payroll history reader reachable without a bearer token is the exact hole the
-- assertion exists to find. Revoke `anon` by name.
revoke all on function public.hr_payroll_export_list(uuid, uuid, integer) from public;
revoke all on function public.hr_payroll_export_list(uuid, uuid, integer) from anon;
grant execute on function public.hr_payroll_export_list(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------
-- 4. ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare v_bad int; v_nullable text;
begin
  select is_nullable into v_nullable from information_schema.columns
   where table_schema='hr' and table_name='payroll_export_line' and column_name='workweek_id';
  if v_nullable is null then raise exception 'hr_l13_02: workweek_id did not land'; end if;
  if v_nullable <> 'NO' then raise exception 'hr_l13_02: workweek_id is nullable — grain fact 1 says every line'; end if;

  if not exists (select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid
                   join pg_namespace n on n.oid=t.relnamespace
                  where n.nspname='hr' and t.relname='payroll_export_line'
                    and c.contype='f' and pg_get_constraintdef(c.oid) like '%hr.workweek%') then
    raise exception 'hr_l13_02: workweek_id has no foreign key to hr.workweek';
  end if;

  -- the append-only guards must still be the ones stopping an UPDATE
  select count(*) into v_bad from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='hr' and c.relname='payroll_export_line' and not tg.tgisinternal
     and tg.tgname in ('_zz_payroll_export_line_no_update','_zz_payroll_export_line_no_delete');
  if v_bad <> 2 then raise exception 'hr_l13_02: payroll_export_line append-only guards are %/2', v_bad; end if;

  if (select client_excluded_columns from platform.entity_types where token='hr_provider_binding')
     is distinct from ARRAY['credential_ref','webhook_secret_ref','connector'] then
    raise exception 'hr_l13_02: provider binding secret refs are not registered client-excluded';
  end if;

  if to_regprocedure('public.hr_payroll_export_list(uuid,uuid,integer)') is null then
    raise exception 'hr_l13_02: the export history reader did not land';
  end if;
  if has_function_privilege('anon', 'public.hr_payroll_export_list(uuid,uuid,integer)', 'execute') then
    raise exception 'hr_l13_02: anon can execute the export history reader';
  end if;
end $$;
