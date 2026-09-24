-- chair-step: this UPDATEs ONE row of `platform.feature_knob` — `custom/external_principal_enabled` — moving its platform value and default from false to TRUE and rewording its label, description and basis, and UPDATEs every `platform.knob_override` row of that knob that answered false to answer true (each one audited by `platform._knob_override_audit_tg`, never deleted). An UPDATE is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what changes. No function body changes: every door already reads this knob through `platform.knob_resolve`, so they all open with it. No grant is written: nobody gains access to anything from this file — each outside share is still a person naming another person on one table.
-- lane: SHARE-GATE-OFF
-- lock: platform
--
-- OWNER RULING (Arman, 2026-09-23 ~23:55 PT, verbatim): "If I'm manually sharing something with
-- people, this cannot possibly be a factor… If I set individual people, then this is a stupid
-- question… I hate bullshit fake gates that do nothing but cause problems for users." And the
-- standing ruling (2026-09-23): capability switches default ON.
--
-- WHAT WAS WRONG. `custom/external_principal_enabled` defaulted to false, so in every
-- organization that had never touched it the Share dialog answered "sharing with people outside
-- is turned off" and drew a "Turn on sharing with people outside" button with a confirm dialog
-- in front of the invite field. That is a second act in front of the one act that matters —
-- naming a person on a table — and it protected nothing: the invite, the accept, the ladder
-- and the revoke already decide who sees what, one person and one table at a time.
--
-- WHAT THIS FILE DOES.
--   1. The knob's platform value and default become true, so every organization answers open
--      unless its own administrator has said otherwise.
--   2. Every existing organization override that said false is superseded by true. The row is
--      UPDATEd, not deleted; `knob_override_audit` records old false -> new true with the note,
--      and the note keeps what it said before after " | before: " so the inverse can put it back.
--   3. The label and description say, in plain words, what an organization administrator is
--      choosing in the settings editor; the share flow never asks.
--
-- WHAT IT DOES NOT DO. It changes no door. It does not touch `custom/world_publish_enabled`
-- (publishing to the open internet stays its own platform switch and its own checks) nor
-- `custom/outside_invite_who` (who may invite stays the organization's answer). An
-- administrator can still turn outside sharing off for their organization in settings; the
-- share panel then says so in one sentence.
--
-- INVERSE: migrations/inverse/sharegate_naming_a_person_is_the_only_act_down.sql

update platform.feature_knob
   set value = 'true'::jsonb,
       default_value = 'true'::jsonb,
       label = 'People in this organization may share tables with people outside it',
       description = 'On by default. When on, anyone who may share a table can name a person outside this organization on it; that person sees that table and nothing else here, at the level they were given, until it is taken back. Turning it off stops new outside shares and closes this organization''s client portals; it is an organization administrator''s setting and is never asked in the share flow.',
       basis = 'SHARE-GATE-OFF (owner ruling, Arman 2026-09-23): naming a person on a table is the only act an outside share needs; a switch in front of it is a fake gate. Default ON per the standing ruling that capability switches default on. Earlier basis: PORTAL (PRODUCTS row 2, 2026-09-20) moved the answer to the organization rung; custom.portal_declare writes the override with the portal''s title in the note.',
       updated_at = now()
 where feature = 'custom' and key = 'external_principal_enabled';

update platform.knob_override
   set value = 'true'::jsonb,
       set_note = 'SHARE-GATE-OFF 2026-09-24: superseded to on by the owner''s ruling that naming a person is the only act an outside share needs.'
                  || ' | before: ' || coalesce(set_note, ''),
       updated_at = now()
 where feature = 'custom' and key = 'external_principal_enabled'
   and value = 'false'::jsonb;
