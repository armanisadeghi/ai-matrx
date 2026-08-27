-- HR domain L3 — migration 15 (register item HRB-015, lane L3 punch + kiosk).
-- Full header lives in matrx-frontend/migrations/hr_l3_15_conformance_client_doors.sql.
--
-- 🚨 WHY: the coordinator dispatched a batch to build four `public.hr_*` doors that already existed,
-- on a report that "routes 30/31 are mock-only because doors are missing". All 25 doors the client
-- union declares were live. Nobody could tell without hand-querying pg_proc, so two lanes nearly
-- built the same four functions twice. A door inventory only a human spot-check can read is how
-- that happens. Check 12 fences the SHAPE of every client door and publishes the live inventory in
-- its `detail`, which is what lets the CI script diff the client's declared union against reality.
--
-- 🚨 THE CHECK WENT RED ON ITS FIRST RUN AND FOUND SOMETHING BIGGER THAN EXPECTED.
-- Not two invoker doors - THIRTEEN. The entire `public.hr_wf_*` family is SECURITY INVOKER:
--   hr_wf_bulk_decide, hr_wf_cancel, hr_wf_decide, hr_wf_delegate, hr_wf_escalate, hr_wf_for_target,
--   hr_wf_inbox, hr_wf_instance, hr_wf_reassign_step, hr_wf_record_result, hr_wf_resolve_failure,
--   hr_wf_resubmit, hr_wf_withdraw
-- (`hr_wf_request` and `hr_wf_submit` are correctly definer, which is what makes the other 13 look
-- like drift rather than a deliberate design.)
--
-- They work TODAY only because two things happen to be true at once: `authenticated` holds USAGE on
-- schema `hr`, and the default PUBLIC EXECUTE grant on the underlying `hr.wf_*` bodies has never
-- been revoked. Both are exactly what this lane REMOVED from `hr.punch_*` in hr_l3_11 as correct
-- hardening. So the day anyone applies that same correct hardening to `hr.wf_*`, the entire
-- workflow client surface - every approval, every inbox, every decision - 403s with no code change,
-- no migration, and no failing test anywhere. That is a latent outage sitting behind a routine
-- security improvement.
--
-- 🚨 NOT THIS LANE'S TO FIX. Thirteen functions in the workflow lane. OWNER: Core C4.
-- Baselined by exact name as a RATCHET: a FOURTEENTH invoker door fails this check immediately, and
-- the list only ever shrinks. Raised to the coordinator.
--
-- Applied live as `hr_l3_15_conformance_client_doors`. Idempotent.

do $outer$
declare
  v_def text;
  v_anchor constant text :=
'  ---------------------------------------------------------------- 9. the writer is a hardened definer';
  v_block constant text :=
'  ---------------------------------------------------------------- 12. every client door is well formed
  check_key := ''client_doors_well_formed'';
  select coalesce(jsonb_agg(jsonb_build_object(''fn'', fn, ''problem'', why) order by fn), ''[]''::jsonb)
    into v_bad
    from (
      select p.proname as fn,
             case
               when not p.prosecdef
                    and p.proname not in (
                      -- GRANDFATHERED RATCHET, owner Core C4. Only ever shrinks.
                      ''hr_wf_bulk_decide'', ''hr_wf_cancel'', ''hr_wf_decide'', ''hr_wf_delegate'',
                      ''hr_wf_escalate'', ''hr_wf_for_target'', ''hr_wf_inbox'', ''hr_wf_instance'',
                      ''hr_wf_reassign_step'', ''hr_wf_record_result'', ''hr_wf_resolve_failure'',
                      ''hr_wf_resubmit'', ''hr_wf_withdraw'')
                 then ''not security definer''
               when not has_function_privilege(''authenticated'', p.oid, ''EXECUTE'')
                 then ''authenticated cannot execute''
               when has_function_privilege(''anon'', p.oid, ''EXECUTE'')
                    and p.proname not in (''hr_kiosk_authenticate'', ''hr_kiosk_claim_pairing'',
                                          ''hr_kiosk_punch'', ''hr_kiosk_session_open'',
                                          ''hr_kiosk_session_close'', ''hr_kiosk_session_heartbeat'')
                 then ''anon CAN execute a non-kiosk door''
             end as why
        from pg_proc p
       where p.pronamespace = ''public''::regnamespace
         and p.proname like ''hr\_%''
         and p.proname not like ''\_\_%'') z
   where why is not null;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(
                ''violations'', v_bad,
                ''grandfathered_invoker_doors'', (
                  select coalesce(jsonb_agg(p.proname order by p.proname), ''[]''::jsonb)
                    from pg_proc p
                   where p.pronamespace = ''public''::regnamespace
                     and p.proname like ''hr\_wf\_%'' and not p.prosecdef),
                ''grandfathered_owner'', ''Core C4 workflow lane. These are SECURITY INVOKER and work ''
                  || ''only because authenticated holds USAGE on schema hr AND the default PUBLIC ''
                  || ''EXECUTE grant on the hr.wf_* bodies is still in place. Revoking PUBLIC there - ''
                  || ''the same correct hardening hr_l3_11 applied to hr.punch_* - 403s the entire ''
                  || ''workflow client surface with no code change and no failing test.'',
                ''why'', ''hr is not PostgREST-exposed, so every client-called HR RPC is a public.hr_* ''
                    || ''wrapper. A door that is missing, invoker, ungranted, or anon-reachable when ''
                    || ''it should not be, is invisible until a surface 403s or a lane rebuilds it.'',
                ''inventory'', (select coalesce(jsonb_agg(p.proname order by p.proname), ''[]''::jsonb)
                                 from pg_proc p
                                where p.pronamespace = ''public''::regnamespace
                                  and p.proname like ''hr\_%''
                                  and p.proname not like ''\_\_%''));
  return next;

  ---------------------------------------------------------------- 9. the writer is a hardened definer';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_write_path_conformance()'::regprocedure;

  if position('client_doors_well_formed' in v_def) > 0 then
    raise notice 'hr_l3_15: already applied'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_15: anchor not found in hr.punch_write_path_conformance';
  end if;

  execute replace(v_def, v_anchor, v_block);
end $outer$;

do $$
declare v_fail text; v_n int; v_inv int;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n <> 12 then raise exception 'hr_l3_15: expected 12 checks, found %', v_n; end if;
  select string_agg(check_key, ', ') into v_fail
    from hr.punch_write_path_conformance() where not ok;
  if v_fail is not null then
    raise exception 'hr_l3_15: the conformance gate is RED: %', v_fail;
  end if;
  select jsonb_array_length(detail -> 'inventory') into v_inv
    from hr.punch_write_path_conformance() where check_key = 'client_doors_well_formed';
  if coalesce(v_inv, 0) < 20 then
    raise exception 'hr_l3_15: the door inventory returned only % entries', coalesce(v_inv, 0);
  end if;
end $$;
