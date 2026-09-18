-- connectors_knobs — the connector primitive's two knobs.
--
-- Arman's standing doctrine: a behavioural choice becomes a KNOB with a system
-- default, an organization choice and (where it is the person's own business) a
-- user choice — never a constant, never a ruling, never agent taste
-- (common-docs/policies/limits-are-knobs-agents-set-them.md). Both rows land on
-- the ONE scoped-configuration store (platform.feature_knob); a second settings
-- mechanism for this feature is banned.
--
-- Read by: features/connectors/ConnectorPromptCard.tsx (`resurface_days`,
-- through lib/scoped-config/effectiveKnobs.ts). `member_default_level` is the
-- declared default for a shared, organization-owned connection and is consumed
-- by the sharing layer, not by the dialog.
--
-- 🚨 There is deliberately NO `connectors.account.default_serves`. Which
-- organizations a connected account serves is not a setting: a personal
-- connection has organization_id NULL and is reachable by its owner wherever
-- they work; an organization-owned one is reachable by that organization's
-- members. The dialog's "Connect for <org>" switch is the whole mechanism, and a
-- served-organizations list would be a second, weaker copy of the access rule
-- (chair ruling, 2026-09-17).
--
-- 🚨 IDEMPOTENT. The seed is `on conflict do nothing` so a re-run never
-- overwrites a human's value; the overridability curation below only writes
-- while `overridable_by` is still the untouched default '{}', so a re-apply
-- cannot clobber a later deliberate change.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due)
values
('connectors', 'prompt.resurface_days',
 '0'::jsonb, '0'::jsonb, 'integer', 'days', 0, 365, null,
 'Bring the connector suggestion card back after (days)',
 'How long after a person dismisses a provider''s connector suggestion card AI Matrx may show it again. 0 means never: a dismissal is final for that person.',
 'agent',
 '0 (never) because a dismissed suggestion that returns on its own is an advertisement, and the champion surfaces (ChatGPT/Codex connectors, Claude Code) all treat a dismissal as final. The knob exists because an organization rolling Google out to a team has a legitimate reason to re-offer it once, and that is the organization''s call, not ours. Range capped at a year so nobody can set a value that reads as "never" by accident.',
 date '2026-10-31'),
('connectors', 'shared_account.member_default_level',
 '"editor"'::jsonb, '"editor"'::jsonb, 'enum', null, null, null,
 '["viewer","commenter","editor","admin"]'::jsonb,
 'What members may do with a shared connector account',
 'The default level a member of the organization gets on a connector account an admin connected FOR the organization: viewer (see that it is connected), commenter, editor (use it — send after review, read the calendar, pick files), admin (also reconnect and disconnect it).',
 'agent',
 'editor because that is the point of connecting an account for the organization — the clinic''s info@ mailbox exists so the team can send from it after review, and a default of viewer would make the whole gesture do nothing. Reconnect and disconnect stay with admins, so the risky half is not handed out by default. Organization rung only: this is the organization''s policy about its own shared credential, and a member must not be able to raise their own level.',
 date '2026-10-31')
on conflict (feature, key) do nothing;

-- OVERRIDABILITY CURATION — deliberate, and never folded into a seed's on-conflict.
--
-- `prompt.resurface_days`: organization AND user. The organization decides
-- whether the card may ever come back; a person may always say "not for me"
-- more strongly than their organization says "show it again", which is what the
-- user rung is for.
update platform.feature_knob
   set overridable_by = ARRAY['organization', 'user'], override_direction = 'any'
 where feature = 'connectors' and key = 'prompt.resurface_days'
   and coalesce(array_length(overridable_by, 1), 0) = 0;

-- `shared_account.member_default_level`: organization ONLY. The user rung is
-- deliberately ABSENT — the person the setting governs is the person it governs
-- the credential against, so a member raising their own level would be the
-- setting defeating itself.
update platform.feature_knob
   set overridable_by = ARRAY['organization'], override_direction = 'any'
 where feature = 'connectors' and key = 'shared_account.member_default_level'
   and coalesce(array_length(overridable_by, 1), 0) = 0;
