-- Messaging conversation-AI knobs (feature `messaging.conversation_ai`).
--
-- WHY: `@ai-matrx/messaging` capped the transcript it sends to its four
-- conversation intelligences at 200 messages, in code, in a package. That is a
-- behavioural opinion — how much history an organization is willing to pay to
-- send to a model, and how much of a long thread an answer is allowed to cover
-- — so it is a knob, not a constant (policies/limits-are-knobs-agents-set-them.md).
-- The package now takes `<MessagingProvider maxTranscriptMessages>` and the host
-- resolves this row.
--
-- AGENT DECISION (2026-09-07). Starting value 200 = the package's own figure,
-- kept so this migration changes no behaviour on the day it lands; what changes
-- is that an organization can now move it. Provisional (set_by='agent'), 45-day
-- review.
--
-- OVERRIDABILITY is set HERE because this is a NEW row — the "a seed never
-- touches overridable_by" rule protects CURATED values on existing rows, which
-- is why the on-conflict clause below leaves all three columns alone.
-- Organizations and individual users may both move it: an org sets its policy,
-- and a person working a very long thread may want more context for their own
-- runs. `any` direction — neither raising nor lowering is the risky way.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, label, description, set_by, basis, review_due,
   overridable_by, override_direction)
values
  ('messaging.conversation_ai', 'transcript_message_cap',
   '200'::jsonb, '200'::jsonb, 'integer', 'messages', 10, 2000,
   'Messages sent to a conversation intelligence',
   'How many of a conversation''s most recent messages are sent when someone asks for a catch-up, a summary, action items, or a reply draft. Older messages are cut, and the answer says so. Higher means a fuller answer on long threads and a more expensive call; lower means cheaper, faster, and more likely to miss earlier context.',
   'agent',
   'The package shipped 200 hardcoded and it has been the live figure since adoption, so it is the only value with evidence behind it. At a typical in-app message length, 200 messages is roughly 20k characters — a real working thread, comfortably inside every current model''s window, and cheap enough to run on every button press. The range 10–2000 makes the floor "the last handful" and the ceiling a blast-radius backstop rather than an operating point.',
   current_date + 45,
   '{organization,user}'::text[], 'any')

on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type    = excluded.value_type,
  unit          = excluded.unit,
  min_value     = excluded.min_value,
  max_value     = excluded.max_value,
  label         = excluded.label,
  description   = excluded.description,
  basis         = excluded.basis,
  -- Never clobber a human's value, their review obligation, or curated
  -- overridability.
  value      = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.review_due else excluded.review_due end;
