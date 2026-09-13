-- dd191_invalidate_leaked_invitation_tokens — EVERY TOKEN A STRANGER COULD READ IS REGENERATED
-- (DD-191 part 4. SECURITY P0. Data + one event type. No schema change.)
--
-- ═══ THE EXPOSURE ══════════════════════════════════════════════════════════════════════════════
-- While `public.inv_list` fell through its NULL role test (fixed in
-- dd191_container_authz_refuses_non_members), ANY signed-in identity who knew an organization's id
-- could list that organization's pending invitations WITH their `token` column — and then read the
-- whole row again through `public.inv_get_managed`. Organization ids are not secret: they appear in
-- URLs, in shared links, and in this platform's own payloads. So the honest census is not "rows an
-- attacker was seen to read"; it is EVERY pending invitation that existed while the door stood.
-- Proved live on 2026-09-13 by reading AI Matrx's invitation token as `test@test.com`, a member of
-- neither AI Matrx nor any organization involved.
--
-- ═══ WHY ROTATION, AND WHAT THE TOKEN IS AND IS NOT ════════════════════════════════════════════
-- A leaked token is NOT by itself an account takeover here: `public.inv_accept` matches the token
-- AND `invited_user_id = auth.uid() or lower(email) = lower(the caller's own email)`, so a stranger
-- holding the token still cannot join. That is a reason to be calm, NOT a reason to keep the token.
-- It is still the credential in the invite link, it still identifies who was invited to what and at
-- which role, and `inv_peek_invited_email` / `inv_get_by_token` read by it. A credential that
-- strangers could copy is spent. Every pending token is regenerated with `gen_random_uuid()`, the
-- same generator `inv_create` uses, so the invite links change and the old ones are dead.
--
-- Nothing else is touched: no status changes, no expiry changes, no deletions, no memberships. An
-- accepted or revoked invitation's token can no longer be used at all (`inv_accept` requires
-- `status = 'pending'`), so rotating those would be theatre; they are left alone.
--
-- ═══ NOTHING FAILS SILENTLY ════════════════════════════════════════════════════════════════════
-- Each invitation's INVITER gets an in-app + email notification through the existing primitive
-- (`communication.notification`, the rows the render/send workers claim), under a newly registered
-- event key `iam.invitation.token_rotated`, saying in plain words what happened, why, and what to
-- do: send the invite again so the person gets the new link. `deep_link` lands on the organization's
-- members page. The event type is registered on the Matrx System organization
-- (39c38960-d30c-4840-b0c1-c9960de95582), where the other 193 platform event types live.

insert into communication.notification_event_type
  (event_key, label, description, default_channels, enabled, organization_id, visibility)
values
  ('iam.invitation.token_rotated',
   'Invitation link was reissued',
   'An invitation''s link was regenerated because the old one could have been read by someone '
   || 'outside the organization. The invitation itself is untouched; only its link changed.',
   '{"email": true, "in_app": true}'::jsonb,
   true,
   '39c38960-d30c-4840-b0c1-c9960de95582',
   'internal'::platform.visibility)
on conflict (event_key) do update
  set label = excluded.label,
      description = excluded.description,
      default_channels = excluded.default_channels,
      enabled = true,
      deleted_at = null,
      updated_at = now();

with rotated as (
  update iam.invitations as invitation
     set token = gen_random_uuid()::text,
         updated_at = now(),
         metadata = coalesce(invitation.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'token_rotated_at', now(),
                         'token_rotated_reason', 'DD-191: inv_list served this token to non-members')
   where invitation.status = 'pending'
     and invitation.deleted_at is null
  returning invitation.id,
            invitation.organization_id,
            invitation.created_by,
            invitation.email,
            invitation.role,
            invitation.target_type,
            invitation.expires_at
)
insert into communication.notification
  (event_key, recipient_user_id, recipient_kind, channel, dedupe_key, payload,
   subject, body, organization_id, target_kind, target_id, deep_link, visibility)
select
  'iam.invitation.token_rotated',
  rotated.created_by,
  'user',
  channel.name,
  'dd191:' || rotated.id::text || ':' || channel.name,
  jsonb_build_object('invitation_id', rotated.id, 'invited_email', rotated.email,
                     'role', rotated.role, 'target_type', rotated.target_type,
                     'reason', 'DD-191'),
  'We reissued an invitation link',
  format(
    'The invitation you sent to %s%s now has a new link, and the old link no longer works.'
    || E'\n\n'
    || 'Why: until today, anyone with an account could list an organization''s pending invitations '
    || 'and see their links. Nobody could have used one to join in someone else''s name — accepting '
    || 'an invitation also requires being signed in as the invited person — but the link itself was '
    || 'readable, so we replaced it. That hole is closed.'
    || E'\n\n'
    || 'What to do: if %s is still waiting to join, send the invitation again so they get the new '
    || 'link. There is nothing to fix on your side.',
    rotated.email,
    case when rotated.expires_at is not null and rotated.expires_at < now()
         then ' (which had already expired)' else '' end,
    rotated.email),
  rotated.organization_id,
  'iam_invitation',
  rotated.id,
  '/organizations/' || rotated.organization_id::text || '/members',
  'personal'::platform.visibility
from rotated
cross join (values ('in_app'), ('email')) as channel(name)
where rotated.created_by is not null;
