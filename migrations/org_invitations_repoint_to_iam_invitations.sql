-- Repoint org-invitation RPCs from the retired public/graveyard.organization_invitations
-- to the canonical iam.invitations. Signatures unchanged (all callers keep working).
-- Applied via Supabase MCP 2026-06-28; idempotent.

CREATE OR REPLACE FUNCTION public.invite_to_organization(org_id uuid, email_address text, member_role org_role, invited_by_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  invitation_id uuid;
  v_invited_user uuid;
BEGIN
  IF NOT auth_is_org_admin(invited_by_user_id, org_id) THEN
    RAISE EXCEPTION 'User does not have permission to invite members';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users u
    JOIN iam.organization_member m ON u.id = m.user_id
    WHERE lower(u.email) = lower(email_address) AND m.organization_id = org_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  SELECT id INTO v_invited_user FROM auth.users WHERE lower(email) = lower(email_address) LIMIT 1;

  UPDATE iam.invitations
     SET token = generate_invitation_token(), role = member_role::text,
         created_by = invited_by_user_id, invited_user_id = v_invited_user,
         status = 'pending', expires_at = now() + interval '7 days', updated_at = now()
   WHERE target_type = 'organization' AND target_id = org_id
     AND lower(email) = lower(email_address) AND status = 'pending' AND deleted_at IS NULL
   RETURNING id INTO invitation_id;

  IF invitation_id IS NULL THEN
    INSERT INTO iam.invitations
      (organization_id, target_type, target_id, email, token, role, status, created_by, invited_user_id, expires_at)
    VALUES
      (org_id, 'organization', org_id, lower(email_address), generate_invitation_token(),
       member_role::text, 'pending', invited_by_user_id, v_invited_user, now() + interval '7 days')
    RETURNING id INTO invitation_id;
  END IF;

  RETURN invitation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(invitation_token text, accepting_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  inv_record iam.invitations;
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = accepting_user_id;

  SELECT * INTO inv_record FROM iam.invitations
   WHERE token = invitation_token AND expires_at > now() AND status = 'pending' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired invitation token'; END IF;

  IF inv_record.email IS NOT NULL AND lower(inv_record.email) <> lower(user_email) THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  INSERT INTO iam.memberships (organization_id, container_type, container_id, user_id, role, status, invited_by)
  VALUES (inv_record.organization_id, 'organization', inv_record.organization_id, accepting_user_id,
          inv_record.role, 'active', inv_record.created_by)
  ON CONFLICT (container_type, container_id, user_id)
  DO UPDATE SET role = inv_record.role, invited_by = inv_record.created_by,
                status = 'active', deleted_at = NULL;

  UPDATE iam.invitations
     SET status = 'accepted', accepted_at = now(), invited_user_id = accepting_user_id, updated_at = now()
   WHERE id = inv_record.id;

  RETURN inv_record.organization_id;
END;
$function$;

-- Invitee-facing preview by token (RLS on iam.invitations blocks a non-member reading by token).
CREATE OR REPLACE FUNCTION public.get_org_invitation_by_token(p_token text)
RETURNS TABLE (id uuid, organization_id uuid, organization_name text, email text,
               role text, token text, expires_at timestamptz, status text)
LANGUAGE sql SECURITY DEFINER STABLE AS $function$
  SELECT i.id, i.organization_id, o.name, i.email, i.role, i.token, i.expires_at, i.status
  FROM iam.invitations i
  LEFT JOIN iam.organizations o ON o.id = i.organization_id
  WHERE i.token = p_token AND i.deleted_at IS NULL
  LIMIT 1;
$function$;
GRANT EXECUTE ON FUNCTION public.get_org_invitation_by_token(text) TO authenticated, anon;

-- Carry over any still-stranded rows from the retired table (idempotent on token).
INSERT INTO iam.invitations
  (organization_id, target_type, target_id, email, token, role, status, created_by, invited_user_id, expires_at, created_at)
SELECT oi.organization_id, 'organization', oi.organization_id, lower(oi.email), oi.token, oi.role::text, 'pending',
       oi.invited_by, (SELECT id FROM auth.users WHERE lower(email) = lower(oi.email) LIMIT 1),
       oi.expires_at, oi.invited_at
FROM graveyard.organization_invitations oi
WHERE NOT EXISTS (SELECT 1 FROM iam.invitations i WHERE i.token = oi.token)
ON CONFLICT (token) DO NOTHING;
