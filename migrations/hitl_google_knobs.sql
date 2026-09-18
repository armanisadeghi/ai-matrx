-- THE GOOGLE HUMAN-IN-THE-LOOP KNOBS (google-native PLAN §7; HITL policy rules 1–3).
--
-- NOT APPLIED BY THIS AGENT — the coordinator applies DB files.
--
-- Every AI-driven capability declares its mode, the platform ships a default,
-- and the organization (and, where the capability is personal, the user)
-- overrides it. The mode is a knob, never a constant — so these rows are the
-- ONLY place the Google write paths may learn what mode they are in, and a
-- runner that cannot resolve one REFUSES (policy rule 8). The client reader is
-- `features/approvals/mode.ts`, on `lib/scoped-config/effectiveKnobs.ts`
-- (`platform.knob_resolve` — the same nearest-rung-wins resolution the settings
-- screens show, so the runner and the screen can never disagree).
--
-- 🚨 GMAIL SEND IS ABSENT ON PURPOSE. A human confirms every single message
-- (PLAN §4.4: "Not a knob"), so the code path has no auto mode to configure —
-- `features/google-workspace/agent/GmailReviewCard.tsx` IS the authorization and
-- covers exactly one message. A knob here would be a control that appears to
-- govern something the code will not obey, which is worse than no control.
-- `hitl.google.gmail_send` must never be added to this register; the queue's
-- `gmail_send` kind hardcodes mode 4 for display and refuses to read a knob.
--
-- 🚨 IDEMPOTENT. The seed is `on conflict do nothing` so a re-run never
-- overwrites a human's value; the curation below writes only while
-- `overridable_by` is still the untouched default '{}'.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values,
   label, description, set_by, basis, review_due)
values
('hitl.google', 'attended_file_write',
 '"mode_1"'::jsonb, '"mode_1"'::jsonb, 'enum',
 '["mode_1","mode_2","mode_3","mode_4","mode_5"]'::jsonb,
 'Google file writes the person asked for',
 'What happens when someone asks an agent, in the moment, to change one of their own Google Docs or Sheets. Mode 1 applies it; mode 4 puts every change in the approval queue first.',
 'agent',
 'Mode 1 because the person asked for it on their own file and Google keeps its own version history, so the change is reversible by the owner without us. Making an attended edit wait on an approval queue would mean the person approving is the person who just asked — a control that governs nobody (PLAN §7).',
 (current_date + 44)),
('hitl.google', 'unattended_file_write',
 '"mode_4"'::jsonb, '"mode_4"'::jsonb, 'enum',
 '["mode_1","mode_2","mode_3","mode_4","mode_5"]'::jsonb,
 'Google file writes from a workflow or a schedule',
 'What happens when a workflow, schedule or background run wants to write to a Google Doc or Sheet with nobody watching. Mode 4 means nothing is written until a person with edit rights approves it in the approval queue.',
 'agent',
 'Mode 4 because nobody is on screen to see the consequence, which is exactly the case the destructive-and-expensive-actions law reserves review for. A clock-driven write to a customer''s spreadsheet has no undo the customer knows about.',
 (current_date + 44)),
('hitl.google', 'agent_import',
 '"mode_4"'::jsonb, '"mode_4"'::jsonb, 'enum',
 '["mode_1","mode_2","mode_3","mode_4","mode_5"]'::jsonb,
 'Imports an agent proposes (Google Contacts, Google Tasks)',
 'What happens when an agent proposes bringing a Google contact or task into Matrx. Mode 4 shows you the fields it would write, and nothing lands until you accept.',
 'agent',
 'Mode 4 because an import writes into records other people read afterwards, and a wrong field silently becomes the truth of a Person. Proposals, not silent writes (PLAN §4.5, §4.7).',
 (current_date + 44)),
('hitl.google', 'review_timeout_hours',
 '24'::jsonb, '24'::jsonb, 'integer', null,
 'How long a review waits before it applies itself (mode 3)',
 'When a capability is set to "review with a timeout", this is how many hours a pending item waits for a person before it applies on its own. The queue shows the exact time it will fire.',
 'agent',
 '24 hours because it is one business day: long enough that a person who works days does not lose the item to a clock, short enough that a mode-3 capability still moves. HITL policy rule 4 requires the instant to be visible before it fires, and the queue prints it.',
 (current_date + 44))
on conflict (feature, key) do nothing;

update platform.feature_knob
   set min_value = 1, max_value = 720, unit = 'hours'
 where feature = 'hitl.google' and key = 'review_timeout_hours'
   and (min_value is null or max_value is null or unit is null);

-- OVERRIDABILITY CURATION — deliberate, never folded into a seed's on-conflict.
--
-- PLAN §7 sets each rung, and the reasons are not interchangeable:
--   * attended_file_write — org AND user. It is the person's own file in the
--     moment; the personal rung is exactly the "certain things, also per user"
--     case in the HITL policy's rule 2.
--   * unattended_file_write — ORG ONLY. A background writer serves the whole
--     organization, so no individual may quietly switch review off for work
--     that lands in everyone's data.
--   * agent_import — org AND user: importing your own contacts is personal.
--   * review_timeout_hours — ORG ONLY. The window is the organization's
--     promise about how long a proposal waits; a user shortening their own
--     would let a clock apply a change nobody in the org chose to allow.
update platform.feature_knob
   set overridable_by = ARRAY['organization','user'], override_direction = 'any'
 where feature = 'hitl.google'
   and key in ('attended_file_write','agent_import')
   and coalesce(array_length(overridable_by, 1), 0) = 0;

update platform.feature_knob
   set overridable_by = ARRAY['organization'], override_direction = 'any'
 where feature = 'hitl.google'
   and key in ('unattended_file_write','review_timeout_hours')
   and coalesce(array_length(overridable_by, 1), 0) = 0;

do $verify$
declare
  v_n integer;
begin
  select count(*) into v_n from platform.feature_knob where feature = 'hitl.google';
  if v_n <> 4 then
    raise exception 'hitl.google must hold exactly 4 knobs, found %.', v_n;
  end if;
  -- The one row that must NEVER exist here (see the header).
  if exists (select 1 from platform.feature_knob
              where feature = 'hitl.google' and key = 'gmail_send') then
    raise exception 'hitl.google.gmail_send exists. Gmail send is human-confirmed per message and has no auto mode to configure.';
  end if;
  raise notice 'hitl.google: 4 knobs registered, gmail_send deliberately absent.';
end;
$verify$;
