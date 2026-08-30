-- hr_c3_15 — A READ UNDER BREAK-GLASS CARRIES THE REASON BREAK-GLASS WAS CALLED.
--
-- RECORD of a live change applied on 2026-08-29 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Slot: hr_c3 #0015.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- THE SECOND FLOOR OF THE SAME BASEMENT, AND ONLY A WORKING GRANT COULD EVER HAVE FOUND IT.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- hr_c3_14 registered the sixteen tokens, so `hr_break_glass` writes its `iam.permissions` row,
-- its `hr.derived_grant` mapping and its audit row for the first time in this domain's history.
-- Then the falsification suite asked the question that separates a grant from a receipt — **can
-- the person now actually read the record through the ordinary audited door** — and the answer
-- was no:
--
--     new row for relation "access_audit" violates check constraint
--     "access_audit_break_glass_justified"
--     CHECK ((NOT is_break_glass) OR (justification IS NOT NULL AND length(justification) >= 20))
--
-- `hr._door_get` stamps `p_is_break_glass => (basis = 'break_glass')` — correctly; a read that
-- happened only because of break-glass must be marked as one. But it passes
-- `p_justification => p_justification`, and `hr_confidential_get` hard-codes that argument NULL
-- (there is nowhere on a normal read to type a reason, and there should not be). So every read
-- under a live break-glass grant raised 23514, and because §4.2's audit write is deliberately
-- **fail-CLOSED**, the raise took the read down with it.
--
-- 🚨 THE GRANT WOULD HAVE BEEN A TROPHY. `hr_break_glass` returns the row itself, so the one call
-- looks like a success and the sixty minutes it buys — the entire point of §4.3's *"so the person
-- can actually do the work"* — were unusable. This is the same shape as the defect above it:
-- a constraint and a code path that had never met, because nothing had ever got far enough for
-- them to meet.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- THE CONSTRAINT IS RIGHT. THE CODE IS WRONG. AND THE FIX IS NOT TO ASK AGAIN.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Three ways to make the 23514 stop, and again only one of them is right:
--
--   ✗ Weaken `access_audit_break_glass_justified`. A break-glass read with no recorded reason is
--     precisely the row a compliance audit exists to make impossible.
--
--   ✗ Stop stamping `is_break_glass` on reads that used the grant. That is worse: the reach would
--     become invisible in the audit trail — a read that only happened because somebody broke
--     glass, filed as an ordinary read.
--
--   ✗ Make `hr_confidential_get` demand a justification argument. §4.3 rules this out in as many
--     words: *"a one-shot read that forces twelve more break-glass calls is over-tightening
--     dressed as rigour."* The grant exists so the work can be done.
--
--   ✓ **The reason already exists — carry it.** The justification was given, vetted against the
--     knob floor, and stored on the break-glass event that created this grant. Every read that
--     grant authorises happened *for that reason*. `hr._break_glass_justification` fetches it
--     from the granting audit row, and `hr._door_get` coalesces the caller's own justification
--     over it.
--
-- What this buys beyond "it works": the audit trail gets BETTER, not merely legal. Each of the
-- (say) nine reads inside a sixty-minute window now names why the glass was broken, instead of
-- one row carrying the reason and nine rows carrying none. Reading the log a year later, the
-- question "what did they look at, and why were they allowed to" is answerable from any single
-- row rather than by joining nine rows back to a tenth.
--
-- 🚨 AND IT CANNOT FABRICATE ONE. The helper reads only rows that are `granted`, `is_break_glass`,
-- for THIS user, THIS token and THIS record — i.e. the act that produced the very grant
-- `hr._break_glass_active` just honoured. If no such row exists, it returns NULL and the
-- constraint fires exactly as before. A read cannot invent a justification it was never given;
-- it can only inherit one that was.

begin;

create or replace function hr._break_glass_justification(p_user uuid, p_token text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  -- The justification recorded on the break-glass ACT that produced the live grant. Scoped to the
  -- same actor, token and record, and to rows that actually granted — a denied break-glass
  -- attempt's justification must never license a later read.
  select a.justification
    from hr.access_audit a
   where a.actor_user_id = p_user
     and a.target_token  = p_token
     and p_id = any(a.target_ids)
     and a.is_break_glass
     and a.granted
     and a.basis = 'break_glass'
     and a.justification is not null
   order by a.occurred_at desc
   limit 1;
$fn$;

comment on function hr._break_glass_justification(uuid, text, uuid) is
  'hr_c3_15. The reason break-glass was called, carried onto every read the resulting grant authorises, so hr.access_audit satisfies access_audit_break_glass_justified truthfully instead of by weakening it. Returns NULL when no granting break-glass act exists, which lets the constraint fire exactly as it should.';

revoke all on function hr._break_glass_justification(uuid, text, uuid) from public;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- hr._door_get — one coalesce, on the audit call only. Nothing about the verdict moves.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._door_get(
  p_token text, p_id uuid, p_purpose text, p_justification text,
  p_break_glass boolean, p_expect_tier text)
returns jsonb
language plpgsql
security definer
-- 🚨 preserved EXACTLY as live (`hr, public`). A CREATE OR REPLACE that quietly re-points a
-- definer function's search_path is a security change wearing a bug fix's clothes.
set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_verdict jsonb; v_audit uuid; v_row jsonb; v_just text;
begin
  if v_uid is null then
    raise exception 'hr audited door: no authenticated caller' using errcode = '42501';
  end if;

  v_verdict := hr._door_verdict(v_uid, p_token, p_id, p_break_glass);

  -- the tier check keeps the two families honest: a Restricted token asked for through the
  -- confidential door is a caller mistake, not a refusal
  if p_expect_tier is not null and (v_verdict ->> 'tier') <> p_expect_tier then
    raise exception 'hr audited door: % is the % tier; use the % door',
      p_token, v_verdict ->> 'tier',
      case when (v_verdict ->> 'tier') = 'restricted' then 'hr_restricted_get' else 'hr_confidential_get' end
      using errcode = '22023';
  end if;

  if not (v_verdict ->> 'allowed')::boolean then
    -- 🚨 THE AUDIT ROW IS WRITTEN AND THE FUNCTION RETURNS. It does not raise. See the header.
    v_audit := hr._record_access_audit(
      p_organization_id => (v_verdict ->> 'organization_id')::uuid,
      p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_row_count => 0,
      p_sensitivity_tier => v_verdict ->> 'tier',
      p_subject_employment_id => nullif(v_verdict ->> 'subject_employment_id','')::uuid,
      p_justification => p_justification, p_is_break_glass => p_break_glass,
      p_denial_reason => coalesce(v_verdict ->> 'reason', v_verdict ->> 'basis'));
    return jsonb_build_object('granted', false, 'reason', v_verdict ->> 'basis',
                              'detail', v_verdict ->> 'reason', 'audit_id', v_audit);
  end if;

  v_row := hr._project_row(p_token, v_verdict ->> 'schema', v_verdict ->> 'table', p_id);

  -- 🚨 hr_c3_15. A read allowed BY a break-glass grant is stamped is_break_glass, and
  -- access_audit_break_glass_justified requires a reason of at least 20 characters on any such
  -- row. There is nowhere on an ordinary confidential read to type one — hr_confidential_get
  -- hard-codes this argument NULL — so before this line EVERY read under a live grant died on
  -- 23514, and §4.2's fail-closed audit took the read down with it. The reason is not asked for
  -- again: it is carried from the break-glass act that created the grant, which is what these
  -- reads are actually happening for.
  v_just := p_justification;
  if (v_verdict ->> 'basis') = 'break_glass' and v_just is null then
    v_just := hr._break_glass_justification(v_uid, p_token, p_id);
  end if;

  -- §4.2: THE AUDIT WRITE IS FAIL-CLOSED. If this insert raises, the read raises too and returns
  -- nothing — the deliberate opposite of public.access_request_report, which wraps its
  -- activity-log write in a savepoint so a log failure cannot fail the operation. That is right
  -- for an activity feed and wrong for a compliance audit: an unauditable read of a medical
  -- record must not happen.
  v_audit := hr._record_access_audit(
    p_organization_id => (v_verdict ->> 'organization_id')::uuid,
    p_action => 'read', p_target_token => p_token,
    p_purpose => coalesce(p_purpose,'operational'), p_basis => v_verdict ->> 'basis',
    p_granted => true, p_target_ids => ARRAY[p_id], p_row_count => 1,
    p_sensitivity_tier => v_verdict ->> 'tier',
    p_subject_employment_id => nullif(v_verdict ->> 'subject_employment_id','')::uuid,
    p_is_self_access => coalesce((v_verdict ->> 'is_self')::boolean, false),
    p_justification => v_just,
    p_is_break_glass => ((v_verdict ->> 'basis') = 'break_glass'));

  return jsonb_build_object('granted', true, 'row', v_row, 'basis', v_verdict ->> 'basis',
                            'is_self_access', coalesce((v_verdict ->> 'is_self')::boolean, false),
                            'audit_id', v_audit);
end
$fn$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- Contract pins.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active,
   must_be_definer)
values
  ('hr', '_door_get', 'hr_c3_15',
   array['hr._break_glass_justification(v_uid, p_token, p_id)',
         'p_is_break_glass => ((v_verdict ->> ''basis'') = ''break_glass'')',
         'p_justification => v_just'],
   array[]::text[],
   'hr_c3_15: a read allowed by a break-glass grant must stay STAMPED as break-glass (dropping '
   || 'that stamp would file it as an ordinary read and hide the reach) and must carry a reason '
   || '(access_audit_break_glass_justified), which it inherits rather than demands. Removing the '
   || 'carry re-breaks every read under a live grant with 23514; removing the stamp makes the '
   || 'break-glass reach invisible in the audit trail. Both are worse than the bug this fixed.',
   true, true),
  ('hr', '_break_glass_justification', 'hr_c3_15',
   array['a.granted', 'a.is_break_glass', 'a.actor_user_id = p_user',
         'p_id = any(a.target_ids)'],
   array[]::text[],
   'hr_c3_15: this may only ever return the reason from a GRANTED break-glass act by the SAME '
   || 'actor on the SAME record. Widening any of those clauses would let a read inherit a '
   || 'justification it was never given — a denied attempt''s reason, or somebody else''s — which '
   || 'is worse than the missing-reason failure it was written to fix.',
   true, true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       must_be_definer  = excluded.must_be_definer,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- FALSIFICATION.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_broken int;
begin
  -- The constraint this repair refused to weaken is untouched.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'hr.access_audit'::regclass
                    and conname = 'access_audit_break_glass_justified'
                    and pg_get_constraintdef(oid) like '%length(justification) >= 20%') then
    raise exception 'hr_c3_15: access_audit_break_glass_justified was weakened. It is the guard, not the bug.';
  end if;

  -- The helper cannot manufacture a reason out of nothing.
  if hr._break_glass_justification(gen_random_uuid(), 'hr_legal_hold', gen_random_uuid())
     is not null then
    raise exception 'hr_c3_15: the justification carrier invented a reason for an actor that never broke glass';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_c3_15: % contract(s) broken', v_broken;
  end if;

  raise notice 'hr_c3_15: a read under break-glass now carries the reason break-glass was called.';
end $$;

commit;
