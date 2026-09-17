-- THE SENT RECORD'S AUDIT TRAIL — who drafted it, who approved it, and when.
--
-- NOT APPLIED BY THIS AGENT. The chair applies DB files and regenerates
-- `pnpm db-types`. Until then `features/crm/gmail/` names this file as the
-- remedy on screen and in the writer's own refusal, rather than silently
-- dropping the audit fields (THE NO-SILENT-FAILURE LAW).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THESE FIVE COLUMNS AND NOTHING ELSE
-- ═══════════════════════════════════════════════════════════════════════════
-- google-native PLAN §4.4: a reviewed Gmail send becomes a real interaction row
-- on the Person's timeline carrying `channel = gmail`, the external message id,
-- `sent_via_account`, and — when an agent drafted it — drafted-by (agent, run)
-- and approved-by (person, time). Champion: HubSpot for the associated sent
-- record; the audit trail is the part HubSpot does NOT have (its drafts are
-- private to their author and no sent record names an approver).
--
-- Four of those six facts already have a home on `crm.interaction`, verified
-- live 2026-09-17 (project brsgrqvjdzwihsvnfqkf), and this file does NOT
-- duplicate them:
--
--   channel = gmail       → `channel_code = 'email'` + `provider = 'gmail'`.
--                           `channel_code` carries a CHECK whose closed list is
--                           call/email/meeting/sms/social/note/task/other, and
--                           `provider` is already how this table names the
--                           sending provider (live rows: 'twilio', 'apollo').
--                           Adding 'gmail' to the channel CHECK would say a
--                           Gmail message is a different KIND of contact from
--                           an email, which it is not.
--   external message id   → `provider_interaction_id` (text).
--   sent_via_account      → `provider_account_id` (text; the Google connection
--                           id, which is the durable identity of the mailbox —
--                           an address can be aliased or renamed).
--   associated with       → `party_id` (required), `deal_id`, `contact_point_id`.
--
-- What has NO home is the two-actor provenance, and it is not Gmail-specific:
-- any interaction an agent drafts and a person approves — an SMS, a call
-- script, a reviewed reply — needs the same five facts. So they are columns on
-- the shared table (THE PLATFORM-PRIMITIVE LAW), not a Gmail side table and not
-- a jsonb blob inside `metadata`, which nothing can index, constrain or certify.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY ABSENT
-- ═══════════════════════════════════════════════════════════════════════════
--  * No `project_id`. A feature table may not depend on a project FK
--    (`common-docs/systems/platform/db-rules/FEATURE.md` §6d). A sent message
--    composed from a project associates through `platform.associations`.
--  * No FK on `drafted_by_agent_id` / `drafted_by_run_id`. An agent's
--    definition and a run's spine live behind services that own their own
--    lifecycle (`runtime.global_execution` is purged by retention policy); a
--    FK would delete or block the audit trail when the run is purged, which is
--    exactly backwards for an audit trail.
--  * No NOT NULL and no backfill. Every existing row predates the trail and
--    genuinely has no approver; inventing one would be a lie in a column whose
--    only job is to be true.

ALTER TABLE crm.interaction
  ADD COLUMN IF NOT EXISTS drafted_by_agent_id uuid,
  ADD COLUMN IF NOT EXISTS drafted_by_run_id uuid,
  ADD COLUMN IF NOT EXISTS drafted_by_label text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_assist_id uuid;

-- The approver is a person in this database, exactly like `performed_by`.
ALTER TABLE crm.interaction
  ADD CONSTRAINT interaction_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id);

-- The queue row the approval was made in, when it was made in the queue.
-- ON DELETE SET NULL: losing the assist row must never take the interaction
-- with it — the send happened whatever became of the proposal.
ALTER TABLE crm.interaction
  ADD CONSTRAINT interaction_approval_assist_id_fkey
  FOREIGN KEY (approval_assist_id) REFERENCES platform.assists(id) ON DELETE SET NULL;

-- An approval is a person AND a time, or it is neither. "Approved by nobody at
-- 14:02" and "approved by Arman at some point" are both unusable as evidence.
ALTER TABLE crm.interaction
  ADD CONSTRAINT interaction_approval_is_who_and_when
  CHECK ((approved_by IS NULL) = (approved_at IS NULL));

-- A run belongs to an agent. A run id with no agent cannot be traced back to
-- what wrote the message, which is the whole point of recording it.
ALTER TABLE crm.interaction
  ADD CONSTRAINT interaction_drafting_run_names_its_agent
  CHECK (drafted_by_run_id IS NULL OR drafted_by_agent_id IS NOT NULL);

-- "Show me everything this agent has sent" and "everything waiting on my
-- approval that went out" are both first-class questions. Partial, because the
-- overwhelming majority of rows are human-logged calls and notes.
CREATE INDEX IF NOT EXISTS interaction_drafted_by_agent_idx
  ON crm.interaction (drafted_by_agent_id, occurred_at DESC)
  WHERE drafted_by_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS interaction_approved_by_idx
  ON crm.interaction (approved_by, approved_at DESC)
  WHERE approved_by IS NOT NULL;

-- The external message id is how an inbound reply is matched back to what we
-- sent, and how a duplicate send is caught. Live rows already use
-- `provider_interaction_id` for the voice provider's call id.
CREATE INDEX IF NOT EXISTS interaction_provider_message_idx
  ON crm.interaction (provider, provider_interaction_id)
  WHERE provider_interaction_id IS NOT NULL;

COMMENT ON COLUMN crm.interaction.drafted_by_agent_id IS
  'The agent that wrote this message, when an agent wrote it. NULL means a person wrote it.';
COMMENT ON COLUMN crm.interaction.drafted_by_run_id IS
  'The run the drafting agent was executing. Requires drafted_by_agent_id.';
COMMENT ON COLUMN crm.interaction.drafted_by_label IS
  'The proposer''s own words for itself, as the approval queue showed it — kept because an agent can be renamed or retired after the fact.';
COMMENT ON COLUMN crm.interaction.approved_by IS
  'The person who authorized this going out. For a reviewed Gmail send it is whoever pressed Send on the review card — that card IS the authorization.';
COMMENT ON COLUMN crm.interaction.approved_at IS
  'When they authorized it. Always set together with approved_by.';
COMMENT ON COLUMN crm.interaction.approval_assist_id IS
  'The platform.assists row the approval was recorded in, when the decision was made in the approval queue rather than in a compose window.';
