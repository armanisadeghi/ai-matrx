-- hr_l3_106 — §5.2 invariant 24: an SMS notice never gains a `read_at`.
--
-- THE DEFECT, MEASURED LIVE
--   `communication.mark_notification_read(p_notification_id, p_channel)` stamps `read_at` and
--   `read_channel` on ANY notification whose caller is authorized, with no regard for the
--   notification's own channel:
--
--       update communication.notification n
--          set read_at = coalesce(n.read_at, now()),
--              read_channel = coalesce(n.read_channel, p_channel), ...
--        where n.id = p_notification_id and (<authz>);
--
--   SPEC-NOTIFICATIONS §5.2 is explicit: *"SMS: read is not observable. It stays NULL forever on
--   that channel, and `delivered_at` is the strongest claim SMS can make."* Invariant 24: *"An SMS
--   notice never gains a `read_at`."* The door ignored that. Measured live: two `channel='sms'`
--   notifications carry a `read_at`, one of them stamped `read_channel='in_app'` — a text message the
--   platform cannot observe being read, recorded as read on a surface it was never shown on. Same law
--   as D1 and the punch-time fix: a status must reflect reality, not the caller's claim.
--
-- WHAT IS AND ISN'T THE DEFECT
--   The `read_channel = p_channel` shape is NOT itself wrong. §5.2 defines `read_channel` as *"which
--   channel produced the read"* — the SURFACE (in-app expand, deep-link follow), which the calling
--   surface legitimately knows. The two live `read_channel` values are only wrong because these are
--   SMS rows that should carry no read at all; fixing invariant 24 removes the symptom at its root.
--   So this migration changes ONE thing: an SMS notice is never marked read.
--
-- Applied live as `hr_l3_106_an_sms_notice_never_gains_a_read_at`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · THE GUARD IS `n.channel <> 'sms'` IN THE WHERE, not a branch in the SET. An SMS row then simply
--     does not match, `read_at` stays its honest NULL, and the door returns false — "no read was
--     recorded", which is exactly true and is what §5.2 tells the UI to render as "delivered".
--   · THE TWO EXISTING SMS ROWS ARE CORRECTED — read_at and read_channel cleared back to NULL, the
--     value §5.2 says they must always hold. A rule that reflects reality cannot leave two rows
--     asserting an unobservable read. Only `channel='sms'` rows with a non-null read_at are touched.
--   · CREATE OR REPLACE, signature unchanged (uuid, text -> boolean) — ACL preserved, no overload.
--   · IDEMPOTENCY (§5.2 inv. 22) is unchanged: `read_at = coalesce(n.read_at, now())` still means a
--     second call does not move a non-SMS read.

create or replace function communication.mark_notification_read(p_notification_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_hit boolean;
begin
  update communication.notification n
     set read_at      = coalesce(n.read_at, now()),
         read_channel = coalesce(n.read_channel, p_channel),
         updated_at   = now()
   where n.id = p_notification_id
     -- hr_l3_106 — §5.2 invariant 24: an SMS notice never gains a read_at (read is not observable
     -- on that channel; delivered_at is the strongest claim it can make). The row simply does not
     -- match, so read_at keeps its honest NULL and the door returns false.
     and n.channel <> 'sms'
     and ((select public.is_platform_admin())
          or (v_uid is not null
              and (n.recipient_user_id = v_uid or n.created_by = v_uid)))
  returning true into v_hit;
  return coalesce(v_hit, false);
end
$function$;

-- ── CORRECT THE EXISTING LIES — SMS rows must hold NULL read_at/read_channel ─────────────────────
update communication.notification
   set read_at = null, read_channel = null, updated_at = now()
 where channel = 'sms'
   and (read_at is not null or read_channel is not null);

-- ── FALSIFICATION ────────────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_sms uuid; v_sms_recipient uuid;
  v_inapp uuid; v_inapp_recipient uuid;
  v_ret boolean; v_read timestamptz; v_lies integer;
begin
  select id, recipient_user_id into v_sms, v_sms_recipient
    from communication.notification where channel='sms' and recipient_user_id is not null limit 1;
  select id, recipient_user_id into v_inapp, v_inapp_recipient
    from communication.notification where channel='in_app' and recipient_user_id is not null limit 1;

  -- an SMS notice, called by its own recipient: must NOT gain a read_at, and must return false.
  if v_sms is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sms_recipient::text, 'role', 'authenticated')::text, true);
    v_ret := communication.mark_notification_read(v_sms, 'in_app');
    select read_at into v_read from communication.notification where id = v_sms;
    if v_read is not null then
      raise exception 'hr_l3_106: an SMS notice gained a read_at (%)', v_read;
    end if;
    if v_ret is not false then
      raise exception 'hr_l3_106: marking an SMS notice returned %, expected false', v_ret;
    end if;
  end if;

  -- an in-app notice, called by its own recipient: IS marked read.
  if v_inapp is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_inapp_recipient::text, 'role', 'authenticated')::text, true);
    v_ret := communication.mark_notification_read(v_inapp, 'in_app');
    select read_at into v_read from communication.notification where id = v_inapp;
    if v_read is null then
      raise exception 'hr_l3_106: an in-app notice was NOT marked read';
    end if;
  end if;

  select count(*) into v_lies from communication.notification
   where channel='sms' and (read_at is not null or read_channel is not null);
  if v_lies <> 0 then
    raise exception 'hr_l3_106: % SMS row(s) still carry a read', v_lies;
  end if;

  raise exception 'hr_l3_106_verify_ok';
exception
  when others then
    if sqlerrm <> 'hr_l3_106_verify_ok' then raise; end if;
end
$verify$;
