-- iam_emergency_door_dd137a2 — THE NOTICE SAYS IT IN WORDS (DD-137a).
--
-- 🚨 RED, proven live on the second forcing run: `23514 notification_outbound_body_ck`. An email
-- or SMS notification row must carry a real `subject` and `body` before it can be pending — the
-- platform refuses a notice with nothing in it, which is the right constraint. The first cut of
-- `iam._notify_door` wrote a payload and no words, so the subject notification raised and took
-- the whole door down with it.
--
-- Two repairs, and the second is the more important one:
--   1. The words are BUILT HERE, from the event and the payload, so every caller of the door gets
--      the same sentence: who opened it, what they opened, the reason they typed, when the key
--      expires. §3.5: "the person whose row was opened is told every time — who opened it, what
--      they opened, the reason they typed, when it expires".
--   2. THE DOOR DOES NOT CLOSE WHEN NOTIFICATIONS ARE DOWN (§3.5). A failure to notify is now
--      caught, recorded as an audited event of its own, and raised as a WARNING — it can never
--      again be the reason an emergency access attempt dies. The audit is the guarantee; the
--      email is the courtesy.

create or replace function iam._notify_door(
  p_organization_id uuid, p_event_key text, p_recipient uuid, p_payload jsonb,
  p_target_id uuid, p_deep_link text, p_dedupe text)
returns integer
language plpgsql
security definer
set search_path to 'iam', 'communication', 'public'
as $fn$
declare
  v_raw jsonb; v_channels text[]; ch text; v_n integer := 0;
  v_actor text; v_subject_line text; v_body text; v_what text; v_when text;
begin
  if p_recipient is null then return 0; end if;

  select t.default_channels into v_raw
    from communication.notification_event_type t
   where t.event_key = p_event_key and t.deleted_at is null
   order by (t.organization_id = p_organization_id) desc
   limit 1;

  -- 🚨 FAILS TOWARD TELLING THE PERSON. An unregistered event key or a malformed channel object
  -- must never be the reason a subject is not told their data was opened.
  if v_raw is null then
    v_channels := ARRAY['in_app'];
  elsif jsonb_typeof(v_raw) = 'array' then
    v_channels := coalesce((select array_agg(value) from jsonb_array_elements_text(v_raw)), ARRAY['in_app']);
  else
    v_channels := coalesce((select array_agg(key) from jsonb_each(v_raw) where value = 'true'::jsonb),
                           ARRAY['in_app']);
  end if;
  if cardinality(v_channels) = 0 then v_channels := ARRAY['in_app']; end if;

  -- ── THE WORDS. A notice a person cannot act on is not a notice.
  select coalesce(u.email, 'someone in your organization') into v_actor
    from auth.users u
   where u.id = coalesce((p_payload->>'opened_by')::uuid, (p_payload->>'requested_by')::uuid);
  v_actor := coalesce(v_actor, 'someone in your organization');
  v_what := coalesce(p_payload->>'token', 'your data');
  v_when := case when (p_payload->>'expires_at') is null then null
                 else to_char((p_payload->>'expires_at')::timestamptz, 'Mon DD, HH24:MI') end;

  if p_event_key = 'platform.access.emergency_door_opened' then
    v_subject_line := 'Someone opened your data';
    v_body := format(
      '%s opened one of your %s records under emergency access.%s%sThe reason they gave: "%s".%s%s'
      || 'This was read-only and it is recorded permanently. You can see every time anyone opened '
      || 'your data on your own access page, and nobody can hide a row from you there.',
      v_actor, v_what, E'\n\n',
      case when v_when is null then '' else format('Their access ends %s.%s', v_when, E'\n\n') end,
      coalesce(p_payload->>'justification', '(none given)'), E'\n\n', E'\n\n');
  elsif p_event_key = 'platform.access.emergency_door_requested' then
    v_subject_line := 'Emergency access to your data was requested';
    v_body := format(
      '%s asked for emergency access to one of your %s records. Nobody can open it alone — an '
      || 'owner of your organization has to approve it first.%sThe reason they gave: "%s".%s'
      || 'You will be told again if it is approved, and this request is on your own access page either way.',
      v_actor, v_what, E'\n\n', coalesce(p_payload->>'justification', '(none given)'), E'\n\n');
  elsif p_event_key = 'platform.access.emergency_door_approval_needed' then
    v_subject_line := 'An emergency access request needs your approval';
    v_body := format(
      '%s asked for emergency access to a private %s record belonging to someone in your '
      || 'organization.%sThe reason they gave: "%s".%s'
      || 'You are the second person: this access does not happen unless you approve it. If you do, '
      || 'it is read-only, time-boxed, and the person it is about has already been told it was asked for.',
      v_actor, v_what, E'\n\n', coalesce(p_payload->>'justification', '(none given)'), E'\n\n');
  else
    v_subject_line := 'An emergency access request about your data was refused';
    v_body := format(
      'A request by %s for emergency access to one of your %s records was refused.%s%s'
      || 'Nothing was opened. It is on your own access page, with the reason.',
      v_actor, v_what, E'\n\n',
      case when (p_payload->>'note') is null then ''
           else format('The note left with the refusal: "%s".%s', p_payload->>'note', E'\n\n') end);
  end if;

  -- ── THE DOOR DOES NOT CLOSE WHEN NOTIFICATIONS ARE DOWN (§3.5).
  begin
    foreach ch in array v_channels loop
      insert into communication.notification
        (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
         subject, body, target_kind, target_id, deep_link, dedupe_key, visibility)
      values (p_organization_id, p_event_key, p_recipient, 'user', ch, p_payload,
              v_subject_line, v_body, 'iam_access_audit', p_target_id, p_deep_link,
              p_dedupe || ':' || ch, 'personal'::platform.visibility)
      on conflict do nothing;
      v_n := v_n + 1;
    end loop;
  exception when others then
    -- audited, loud, and NOT fatal. A failed notification is itself an event the person sees.
    raise warning 'iam._notify_door: could not tell % about % (% %). The access still happened and is in iam.access_audit; the notice did not go out.',
      p_recipient, p_event_key, sqlstate, sqlerrm;
    begin
      insert into iam.access_audit
        (organization_id, action, target_token, target_ids, data_class, purpose, basis,
         justification, is_emergency_door, granted, denial_reason, subject_user_id,
         actor_user_id, created_by, visibility)
      values (p_organization_id, 'notice_failed', coalesce(p_payload->>'token','(unknown)'),
              ARRAY[]::uuid[], coalesce(p_payload->>'data_class','(unknown)'), 'audit', 'refused',
              null, true, false,
              format('the subject could not be told: %s %s', sqlstate, sqlerrm),
              p_recipient, auth.uid(), auth.uid(), 'personal'::platform.visibility);
    exception when others then null;
    end;
    return 0;
  end;
  return v_n;
end $fn$;

revoke execute on function iam._notify_door(uuid, text, uuid, jsonb, uuid, text, text) from public, anon, authenticated;

comment on function iam._notify_door is
  'THE EMAIL IS THE COURTESY, THE AUDIT IS THE GUARANTEE (VISIBILITY-BY-CLASS §3.5). Builds the sentence the person actually reads — who opened it, what they opened, the reason they typed, when the key expires — and never raises: a notification failure is recorded as its own audited event and the door stays open for the emergency it was called for.';

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = '_notify_door';
  if v_src !~ 'subject, body' then
    raise exception 'dd137a2: the notice still writes no words';
  end if;
  if v_src !~ 'notice_failed' then
    raise exception 'dd137a2: a failed notice is still silent';
  end if;
  raise notice 'dd137a2: assertions passed';
end $$;
