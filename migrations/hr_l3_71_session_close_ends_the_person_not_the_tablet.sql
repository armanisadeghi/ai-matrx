-- hr_l3_71_session_close_ends_the_person_not_the_tablet.sql
--
-- 🚨 CLOSING A PERSON'S INTERACTION WAS KILLING THE TABLET'S OWN SESSION.
--
-- SPEC-TIME §1.2 (U-05) describes TWO session objects: the DEVICE session a wall tablet holds
-- between authentications (`employment_id IS NULL`, TTL in HOURS) and the PERSON-BOUND interaction
-- session minted when a PIN is accepted (TTL in MINUTES) — and says plainly that "the 12-hour value
-- never gates a person's session: a tablet staying authenticated all day must not leave one
-- employee's identity live on it".
--
-- In the built schema these are ONE ROW. `hr_kiosk_session_open` binds the person by setting
-- `employment_id` on the device's own session row, so `hr_kiosk_session_close` — which sets
-- `ended_at` — was ending the DEVICE session every time somebody finished a punch. Observed live:
-- sessions 9ad63fdb and cb3c9f13, both `employment_id` set, both `ended_at` seconds after they
-- opened, `end_reason='completed'`. The tablet's next punch attempt then failed
-- `session_not_valid`, which the kiosk correctly renders as a uniform refusal — so the person at
-- the tablet was told to check their employee number and PIN when both were perfectly right, and
-- the tablet only recovered when its heartbeat noticed and re-authenticated.
--
-- The fix keeps the spec's INTENT on the single row: closing a session that carries a person clears
-- the PERSON BINDING and leaves the device session alive. Closing a session with no person bound
-- still ends the device session, which is what that call means for a tablet going out of service.
--
-- The deeper finding — that the two session objects are one row, so a person-bound TTL in minutes
-- cannot actually be enforced separately from the device's TTL in hours — is reported to the data
-- lane rather than papered over here; this migration does not invent a second table.
--
-- Applied live 2026-08-28.

create or replace function public.hr_kiosk_session_close(
  p_session_token text, p_reason text default 'completed')
returns jsonb
language plpgsql
security definer
set search_path = public, hr, extensions
as $fn$
declare s hr.kiosk_session%rowtype;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason','session_not_valid'); end if;

  perform hr.arm_write();

  if s.employment_id is not null then
    -- 🚨 END THE PERSON, NOT THE TABLET. The identity does not stay live on a shared screen, and
    -- the device session it was bound onto survives so the next person can walk up and punch.
    update hr.kiosk_session
       set employment_id = null,
           auth_method   = 'device',
           started_at    = null
     where id = s.id;
    return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'closed', 'person');
  end if;

  -- No person bound: this is the device session itself going out of service.
  -- the live end_reason vocabulary is completed | expired | timeout | revoked | device_suspended |
  -- superseded; anything else is normalised rather than refused, because a kiosk closing a session
  -- must never fail on a word
  update hr.kiosk_session
     set ended_at = now(),
         end_reason = case when p_reason in ('completed','expired','timeout','revoked',
                                             'device_suspended','superseded')
                           then p_reason else 'completed' end
   where id = s.id;
  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'closed', 'device');
end
$fn$;
