-- edu_guardian_confirm_verification_audits_itself.sql
--
-- RECORD OF A CHANGE ALREADY APPLIED LIVE (Supabase txzxabzwovsujtloxrus, 2026-08-19).
--
-- THE GAP: every education data-rights and age RPC self-audits to
-- education.data_rights_event — edu_set_age_band, edu_guardian_set_age_band,
-- edu_export_study_data, edu_delete_study_data, edu_restore_study_data and
-- edu_purge_expired_study_data all write a row. The single most consequential
-- COPPA action did not: public.guardian_confirm_verification() — the
-- service-only RPC that marks a parent's consent VERIFIED and thereby unblocks
-- ALL AI for an under-13 account — wrote nothing. The education.guardian_link
-- row was the only record that consent was ever given, and it is mutable.
--
-- THE FIX: the same self-audit pattern the sibling RPCs already use. One new
-- action value on the reused ledger; no parallel table. Whether COPPA requires
-- a separate IMMUTABLE consent ledger is a counsel question already on the
-- record (common-docs/projects/education-platform/COPPA_CONSENT_RUNBOOK.md §1)
-- and is deliberately NOT decided here — this closes the plain engineering gap
-- that the audit trail was missing entirely.
--
-- Idempotent: constraint drop-then-add guarded by existence check; CREATE OR REPLACE.

-- ─── 1. Widen the reused ledger's action vocabulary ──────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'data_rights_event_action_check'
      and conrelid = 'education.data_rights_event'::regclass
  ) then
    alter table education.data_rights_event
      drop constraint data_rights_event_action_check;
  end if;
  alter table education.data_rights_event
    add constraint data_rights_event_action_check
    check (action in (
      'export', 'delete', 'restore',
      'age_band_change', 'age_band_change_blocked', 'purge',
      'guardian_consent_verified'
    ));
end $$;

-- ─── 2. guardian_confirm_verification now audits itself ──────────────────────
-- user_id is the STUDENT: the child is the subject of the consent, their AI
-- access is what flips, and the ledger's RLS (user_id = auth.uid()) is what
-- lets them see their own data-rights history — same subject choice as
-- age_band_change. The guardian, the actor, and the DB role are all in detail.
--
-- The actor is recorded as auth.uid(), which is NULL on the normal path: this
-- RPC is service_role-only and is called by the Stripe webhook / secret-token
-- admin routes with no end-user JWT. That NULL is meaningful (it is the proof
-- no user session performed the write), so detail also carries current_user
-- and the p_ref that ties the row back to the Stripe PaymentIntent, the
-- uploaded signed form's file id, or the vendor's reference.
--
-- Re-verification of an already-verified link is a real event, not a no-op:
-- prior_verified_at / prior_method make that history readable from the ledger
-- even though guardian_link only ever shows the latest state.
create or replace function public.guardian_confirm_verification(
  p_link_id uuid,
  p_method  text,
  p_ref     text
)
returns education.guardian_link
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_row               education.guardian_link;
  v_prior_verified_at timestamptz;
  v_prior_method      text;
begin
  if p_method is null or p_method not in ('card', 'signed_form', 'vendor_id') then
    raise exception 'Invalid consent method: %', coalesce(p_method, '(null)') using errcode = '22023';
  end if;

  select verified_at, consent_method into v_prior_verified_at, v_prior_method
  from education.guardian_link where id = p_link_id;

  update education.guardian_link
    set verified_at      = now(),
        consent_method   = p_method,
        verification_ref = p_ref,
        updated_at       = now()
  where id = p_link_id
    and status = 'active'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No active guardian link % to verify', p_link_id using errcode = 'P0002';
  end if;

  insert into education.data_rights_event (user_id, action, detail)
  values (
    v_row.student_user_id,
    'guardian_consent_verified',
    jsonb_build_object(
      'link_id',            v_row.id,
      'guardian_user_id',   v_row.guardian_user_id,
      'student_user_id',    v_row.student_user_id,
      'method',             p_method,
      'verification_ref',   p_ref,
      'verified_at',        v_row.verified_at,
      'actor',              auth.uid(),
      'actor_db_role',      current_user,
      'via',                'guardian_confirm_verification',
      'prior_verified_at',  v_prior_verified_at,
      'prior_method',       v_prior_method,
      're_verification',    v_prior_verified_at is not null
    )
  );

  return v_row;
end;
$$;
revoke execute on function public.guardian_confirm_verification(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.guardian_confirm_verification(uuid, text, text) to service_role;

comment on function public.guardian_confirm_verification(uuid, text, text) is
  'SERVICE-ONLY. Marks an active education.guardian_link verifiably-consented (COPPA §312.5) and self-audits the act to education.data_rights_event (action=guardian_consent_verified) with the link, guardian, method, verification_ref, actor and prior verification state. A child can never self-verify.';
