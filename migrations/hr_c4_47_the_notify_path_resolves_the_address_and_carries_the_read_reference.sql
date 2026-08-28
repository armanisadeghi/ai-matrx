-- HR domain C4 — migration 47 (register item HRB-008; HRB-002 D15 + HRB-001 D15 verifiers, both on
-- the notification path, bundled: address resolution AND the read reference).
--
-- hr._wf_notify wrote communication.notification directly, and it got TWO things wrong that both end
-- at "we cannot prove we reached this person":
--
-- 🚨 D3 (HRB-002): NO ADDRESS, NO RESOLVER. It inserted with `to_address = null` and never called
--    the resolver, so every sms/email landed as a generic `failed` / `missing_recipient_address`
--    instead of the spec's `skipped` with a NAMED reason. Measured 2026-08-27→28: 153 sms + 136
--    email = 289 such rows, all from this path. SPEC-NOTIFICATIONS §3.2/§3.3: `email`/`sms` resolve
--    to a real address, `in_app` needs none (the row IS the delivery), and a channel that cannot be
--    addressed writes a terminal `skipped` row carrying the refusal as `error_code` — "so 'we never
--    texted this person' always has a reason attached." The one door, aidream's
--    `service.py::notify()`, does exactly this.
--
-- 🚨 DEFECT-1 (HRB-001): NO READ REFERENCE IN THE LINK. §5.2: "the link carries a notice reference;
--    opening it stamps `read_at`." The deep link was `/hr/tasks/<instance>?step=<step>` — the object
--    route, correct per §2.1 — but with NO notice reference, so the read-stamp page had nothing to
--    stamp. Measured: 498 rows carry a deep_link, ZERO contain `notice=`, `read_at` NULL on all of
--    them. The verifier proved the stamp fires the moment `&notice=<id>` is appended; nothing fed
--    it. This path KNOWS the id of the row it just created — so it threads it into the link.
--
-- Both fixes live in ONE rewrite of hr._wf_notify because both are about the row this function
-- emits, and the coordinator asked for them in one pass.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. RESOLVE THROUGH communication.resolve_channel_address — the SAME resolver the one door uses
--    (§3.3). A non-null `refusal` writes `status='skipped'`, `error_code=refusal`. `in_app` is never
--    resolved (the row is the delivery). Refusal vocabulary is the resolver's own
--    (`no_contact_point | unverified | suppressed | opted_out | dnc`); `no_employment` is spec prose
--    with no live mechanism — the resolver returns `no_contact_point` for a user with no employment.
--
-- 2. THE DEEP LINK CARRIES `notice=<this row's id>`, APPENDED TO THE OBJECT ROUTE. The object route
--    stays (§2.1: "the exact actionable object, never a module landing page"); the notice reference
--    is an added parameter (§5.2), joined with `&` when the route already has a query and `?`
--    otherwise. Each channel is a distinct notification row with a distinct id, so the id is
--    generated per row and the link is composed per row — on BOTH the `deep_link` column (what the
--    worker renders into email/sms) and `payload.deep_link`.
--
-- 3. 🚨 ONE INSERT PATH, NOT TWO. The old function had two near-identical insert loops (event
--    defaults, then explicit `allow` channels). A fix applied to one and not the other is the exact
--    class of bug this closes. The channels are computed into ONE set and looped ONCE.
--
-- 4. 🚨 THE RETURN COUNTS DELIVERABLE NOTICES, NOT SKIPPED ONES — AND THAT SERVES D285.
--    `hr._wf_not_attested` reads the count (`v_sent = 0 → notified_as = 'nobody'`). A
--    `skipped`-no-address row is a recorded NON-delivery; counting it would tell that function a
--    recipient was reached when nobody could be — the D285 falsehood. Only `pending` inserts count.
--
-- 5. THE 289 HISTORICAL failed ROWS ARE LEFT AS EVIDENCE, NOT REWRITTEN. Each has attempt_count >= 1
--    and no claimed_by — the worker genuinely claimed, attempted, and failed for want of an address,
--    so `failed` records what the worker DID. The 153 sms rows re-resolve to `no_contact_point`
--    today (a cosmetic reason change on rows nobody re-reads); the 136 email rows re-resolve to a
--    REAL address, so "re-deriving" them means RE-QUEUING day-old workflow mail about requests
--    already decided — harm, not repair. Whether to re-send the 136 is a product call, reported to
--    the verifier, not made by a migration.
--
-- 6. THE CONCURRENT communication.* P0 REVOKE IS ALREADY LANDED AND DOES NOT REACH THIS PATH.
--    `communication.resolve_channel_address` is now `{postgres, service_role}`; hr._wf_notify is
--    SECURITY DEFINER owned by postgres and calls it as postgres. Coordinated, not fought.
--
-- OUT OF SCOPE, REPORTED NOT TOUCHED:
--   · esign._notify composes the same notice-less deep link — flagged to the e-sign lane (D286), not
--     edited here.
--   · DEFECT-1b (a `party` recipient has no read path at all — mark_notification_read authorizes on
--     recipient_user_id/created_by, both NULL for a party): SPEC-NOTIFICATIONS §4.5 leaves the
--     non-user read model UNSPECIFIED — no token-scoped path in the spec or SPEC-ESIGN — so it is a
--     STOP-and-report ruling, filed as D287, never guessed at.
--   · DEFECT-2 (the channel guard inside mark_notification_read) is the SQL lane's, bundled with its
--     communication.* P0. Not touched.
--
-- Authority: SPEC-NOTIFICATIONS §3.2/§3.3/§4.2 (skip-with-a-reason) and §5.2/§2.1 (the read reference
-- on the object route); the one-door lesson.
-- Applied live as `hr_c4_47_the_notify_path_resolves_the_address_and_carries_the_read_reference`.
-- Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_47_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the notify door, rewritten once
do $mig$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_notify';
  if v_src ~ 'resolve_channel_address' and v_src ~ 'notice=' then
    raise notice 'hr_c4_47: hr._wf_notify already resolves the address and carries the read reference';
  elsif v_src !~ 'p_user, ''user'', ch, v_payload' then
    raise exception 'hr_c4_47: hr._wf_notify is not the expected direct-insert version — refusing to overwrite drift';
  else
    create or replace function hr._wf_notify(p_instance uuid, p_step uuid, p_event_key text,
                                             p_notice_kind text, p_user uuid, p_employment uuid,
                                             p_extra jsonb default '{}'::jsonb)
    returns integer
    language plpgsql security definer set search_path to 'hr', 'public'
    as $fn$
    declare
      inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
      v_channels text[]; v_policy jsonb; ch text; v_n integer := 0; v_link text; v_payload jsonb;
      v_send text[]; v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
      v_id uuid; v_row_link text;
    begin
      if p_user is null then return 0; end if;
      select * into inst from hr.workflow_instance where id = p_instance;
      if not found then return 0; end if;
      select * into ft from hr.workflow_flow_type
       where flow_key = inst.flow_key and deleted_at is null
       order by (organization_id = inst.organization_id) desc limit 1;

      v_channels := hr._notify_channels(p_event_key, inst.organization_id);
      v_policy := coalesce(ft.channel_policy, '{}'::jsonb);
      -- §2.1: the object route, resolving to the exact actionable object.
      v_link := '/hr/tasks/' || p_instance::text || coalesce('?step=' || p_step::text, '');

      v_payload := coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
        'instance_id', p_instance, 'step_id', p_step, 'flow_key', inst.flow_key,
        'target_token', inst.target_token, 'target_id', inst.target_id,
        'notice_kind', p_notice_kind,
        'employment_id', p_employment, 'sensitivity_tier', inst.sensitivity_tier);

      -- RD 3: ONE list, so there is ONE insert path. Event defaults minus denies, UNION the
      -- channels the flow type explicitly allows. `deny` wins over the event default.
      select coalesce(array_agg(distinct s.ch), '{}'::text[]) into v_send
        from (
          select c1 as ch from unnest(v_channels) c1
           where coalesce(v_policy ->> c1, 'default') <> 'deny'
          union
          select k from jsonb_each_text(v_policy) e(k, val) where val = 'allow'
        ) s;

      foreach ch in array v_send loop
        -- RD 1: resolve for a deliverable channel; in_app IS the delivery row. A non-null refusal is
        -- a NAMED skip, never a placeholder address and never a raise.
        if ch in ('email', 'sms') then
          select rr.address, rr.refusal into v_addr, v_refusal
            from communication.resolve_channel_address(
                   ch, inst.organization_id, 'user', p_user, null, null, null) rr;
        else
          v_addr := null; v_refusal := null;
        end if;

        if ch in ('email', 'sms') and v_refusal is not null then
          v_status := 'skipped'; v_errcode := v_refusal;
          v_errmsg := format('No %s address for this recipient (%s).', ch, v_refusal);
        else
          v_status := 'pending'; v_errcode := null; v_errmsg := null;
        end if;

        -- RD 2: the notice reference on the object route. Each channel is a distinct row with a
        -- distinct id, so the link is composed per row and points at itself for the stamp.
        v_id := gen_random_uuid();
        v_row_link := v_link
                   || case when v_link like '%?%' then '&' else '?' end
                   || 'notice=' || v_id::text;

        insert into communication.notification
          (id, organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
           to_address, status, error_code, error_message,
           target_kind, target_id, deep_link, dedupe_key, visibility)
        values (v_id, inst.organization_id, p_event_key, p_user, 'user', ch,
                v_payload || jsonb_build_object('deep_link', v_row_link),
                v_addr, v_status, v_errcode, v_errmsg,
                'hr_workflow_step', p_step, v_row_link,
                'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                        || ':' || p_notice_kind || ':' || ch,
                'personal'::platform.visibility)
        on conflict do nothing;

        -- RD 4: only a DELIVERABLE notice counts toward the return.
        if v_status = 'pending' then v_n := v_n + 1; end if;
      end loop;

      return v_n;
    end
    $fn$;
    raise notice 'hr_c4_47: hr._wf_notify resolves the address, skips with a reason, and carries the read reference';
  end if;
end
$mig$;

-- ============================================================ 2. the contract
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_47';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('hr', '_wf_notify', 'hr_c4_47',
    array['communication.resolve_channel_address', '''skipped''', 'v_refusal',
          '''notice='' || v_id', 'if v_status = ''pending'' then v_n := v_n + 1'],
    array['p_user, ''user'', ch, v_payload,'], true,
    'hr_c4_47: hr._wf_notify must (a) RESOLVE the address through communication.resolve_channel_address and write `skipped` + the named refusal when there is none — never a generic failed (289 failed/missing_recipient_address rows came from the direct insert, which is the banned text); (b) carry the notice reference `notice=<row id>` on the object route, or the read-stamp page has nothing to stamp (498 rows, 0 with notice=, all read_at NULL); (c) count only DELIVERABLE (pending) notices in its return, or hr._wf_not_attested reads a skipped-no-address row as a reached recipient (the D285 falsehood).');
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb;
  v_inst uuid; v_step uuid; v_noreach uuid; v_reachable uuid;
  v_sms_status text; v_sms_code text; v_email_addr text; v_email_status text;
  v_link text; v_hit boolean; v_stamped boolean;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_notify') !~ 'resolve_channel_address' then
    raise exception 'hr_c4_47: hr._wf_notify does not resolve the address';
  end if;

  -- pick an active step whose flow does NOT deny sms — pay_change denies it by policy
  -- ("a pay change should not arrive by text"), which is the deny-wins behavior, not a bug.
  select st.id, i.id into v_step, v_inst
    from hr.workflow_step st join hr.workflow_instance i on i.id = st.workflow_instance_id
    left join hr.workflow_flow_type ft on ft.flow_key = i.flow_key and ft.deleted_at is null
   where st.state = 'active' and coalesce(ft.channel_policy ->> 'sms', 'default') <> 'deny'
   order by st.created_at limit 1;
  v_noreach   := '87a6e699-3622-4869-8843-d0867456c0dd';  -- has email, no phone -> sms no_contact_point
  v_reachable := (select nt.recipient_user_id from communication.notification nt
                   cross join lateral communication.resolve_channel_address(
                     'email', nt.organization_id, 'user', nt.recipient_user_id, null, null, null) rr
                  where rr.refusal is null and nt.channel = 'email' limit 1);

  if v_step is not null then
    begin
      -- (a) no-contact-point SMS -> skipped/no_contact_point, NOT failed
      perform hr._wf_notify(v_inst, v_step, 'hr.time.attestation_overdue', 'timeout_warning', v_noreach, null, '{}'::jsonb);
      select status, error_code, deep_link into v_sms_status, v_sms_code, v_link
        from communication.notification
       where recipient_user_id = v_noreach and channel = 'sms' and target_id = v_step
       order by created_at desc limit 1;
      if v_sms_status is distinct from 'skipped' or v_sms_code is distinct from 'no_contact_point' then
        raise exception 'hr_c4_47: a no-contact-point SMS got %/% (expected skipped/no_contact_point)',
          v_sms_status, v_sms_code;
      end if;
      -- and even a skipped row carries the notice reference (it is still evidence a human may open)
      if v_link is null or v_link not like '%notice=%' then
        raise exception 'hr_c4_47: the deep link carries no notice reference: %', v_link;
      end if;

      -- (b) a resolvable recipient -> address + pending, and the notice reference is its OWN id
      if v_reachable is not null then
        perform hr._wf_notify(v_inst, v_step, 'hr.time.attestation_overdue', 'timeout_warning', v_reachable, null, '{}'::jsonb);
        select to_address, status, deep_link into v_email_addr, v_email_status, v_link
          from communication.notification nt
         where nt.recipient_user_id = v_reachable and nt.channel = 'email' and nt.target_id = v_step
         order by created_at desc limit 1;
        if v_email_addr is null or v_email_status is distinct from 'pending' then
          raise exception 'hr_c4_47: a resolvable email recipient got addr=%/status=% (expected address + pending)',
            v_email_addr, v_email_status;
        end if;
        -- 🚨 the read reference in the link IS this row's id, and following it stamps read_at
        if v_link !~ ('notice=' ||
             (select nt.id::text from communication.notification nt
               where nt.recipient_user_id = v_reachable and nt.channel = 'email'
                 and nt.target_id = v_step order by created_at desc limit 1)) then
          raise exception 'hr_c4_47: the notice reference is not this row''s own id: %', v_link;
        end if;
        -- (the end-to-end stamp — following the link AS THE RECIPIENT — is proven in
        -- scripts/hr/hrb008_notify_read_path_proof.py, where the recipient role can be assumed;
        -- here, running as the migration owner, auth.uid() is null, so mark_notification_read's
        -- recipient authorization cannot match. The producer-side guarantee — the link carries this
        -- row's own id — is what this migration owns, and it is asserted above.)
      end if;

      -- (c) the resolving path produced NO missing_recipient_address failure
      if exists (select 1 from communication.notification
                  where target_id = v_step and status = 'failed'
                    and error_code = 'missing_recipient_address'
                    and recipient_user_id in (v_noreach, coalesce(v_reachable, v_noreach))) then
        raise exception 'hr_c4_47: the resolving path still produced a missing_recipient_address failure';
      end if;

      raise exception 'hr_c4_47_rollback_marker';
    exception
      when others then
        if sqlerrm !~ 'hr_c4_47_rollback_marker' then raise; end if;
    end;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_47: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_47: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_47_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_47: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_47: the notify path resolves the address and carries the read reference';
end $$;
