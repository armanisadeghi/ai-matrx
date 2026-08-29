-- continued_access_01 — THE DEPARTED-MEMBER STATE (platform primitive `continued-access`).
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29. Doc kit:
-- common-docs /systems/platform/continued-access/STATE.md (Arman's ruling: VISION.md).
--
-- Arman, 2026-08-29: "a user account can be deactivated but also put into a state where they
-- still have a portal they come into". This table IS that state. One row per (organization,
-- person) whose membership in that organization has ENDED but whose relationship with it has not.
--
-- 🚨 ORG-SCOPED, NEVER PERSONAL. The row belongs to the EMPLOYER's organization. The portal is
-- the org's offering to its alumni; the org controls it, pays for it, and can end it.
--
-- 🚨 THE ACCESS PROPERTY IS FREE, BY CONSTRUCTION. Departing sets
-- `iam.memberships.status = 'departed'`, and `iam.organization_member` -- the view every org-grant
-- predicate reads (has_org_access_for, is_org_admin_for, my_orgs) -- filters `status='active'`.
-- A departed person's org grants therefore vanish the moment the status flips, with no sweep and
-- no per-feature revocation list. Everything they can still reach must be granted EXPLICITLY by
-- a knob, through a SECURITY DEFINER door. That is the whole security model.
--
-- 🚨 IDEMPOTENT. `platform.create_entity_table` is NOT re-runnable (it creates), so it is guarded
-- on the table's absence. migrations/ is a live drop box: another lane's auto-applier will
-- re-apply this file, and the second run must be a clean no-op.

do $$
begin
  if to_regclass('platform.continued_access') is null then
    perform platform.create_entity_table(
      p_schema => 'platform',
      p_table => 'continued_access',
      p_token => 'platform_continued_access',
      p_label => 'Continued Access',
      p_fields => ARRAY[
        'subject_user_id uuid NOT NULL REFERENCES auth.users(id)',   -- the departed person
        'membership_id uuid',                                        -- the membership that ended; history outlives it
        'departed_at timestamptz NOT NULL DEFAULT now()',
        -- NULL = indefinite. Arman: "or if they want to keep it on indefinitely."
        'access_cutoff_at timestamptz',
        -- The org cutting access entirely, NOW, regardless of the scheduled cutoff.
        'revoked_at timestamptz',
        'revoked_by uuid REFERENCES auth.users(id)',
        'revoke_reason text',
        -- Where the departure came from, so a consumer can trace it. e.g. origin='hr.separation'.
        'origin text',
        'origin_id uuid',
        -- The personal contact on file. This is what lets the notification spine address a
        -- former employee who has no login, without a live HR lookup at send time.
        'contact_email text',
        'contact_phone text'
      ],
      p_variant => 'ledger',      -- org members read their org's rows; no client write path
      p_versioned => false,
      p_soft_delete => true,
      p_visibility => 'internal',
      p_category => false,
      p_listed => false,
      p_org_default => true,
      p_gin_jsonb => false,
      p_parents => NULL
    );
  end if;
end $$;

create unique index if not exists continued_access_one_live_per_person
  on platform.continued_access (organization_id, subject_user_id)
  where deleted_at is null;

create index if not exists continued_access_subject_idx
  on platform.continued_access (subject_user_id)
  where deleted_at is null;

comment on table platform.continued_access is
  'The departed-member state (platform primitive continued-access, Arman 2026-08-29). One row per (organization, person) whose membership ENDED while the organization chose to keep offering them a portal. ORG-SCOPED: the employer''s offering, never the person''s personal space. Written only by the continued_access_* doors. THIS ROW CONVEYS NO GRANTS -- departing sets iam.memberships.status=''departed'', which iam.organization_member excludes, so org grants vanish by construction; every reachable feature is gated by a continued_access.* knob through a SECURITY DEFINER door.';
comment on column platform.continued_access.access_cutoff_at is
  'NULL = indefinite (Arman: "or if they want to keep it on indefinitely"). A timestamp = when the portal stops answering for this person.';
comment on column platform.continued_access.revoked_at is
  'The org cutting this person off entirely, now. Distinct from access_cutoff_at, which is a schedule.';
comment on column platform.continued_access.contact_email is
  'Personal contact on file -- the address the notification spine uses to reach a departed person who has no login yet.';
