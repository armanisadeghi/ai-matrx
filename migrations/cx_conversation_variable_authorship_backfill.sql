-- cx_conversation_variable_authorship_backfill — THE CONVERSATIONS THAT WERE ALREADY WRONG.
--
-- `cx_conversation_variable_authorship.sql` gives a conversation somewhere to record who
-- wrote its variables, and matrx-frontend now records it at the first turn. That is
-- forward-looking by construction: every conversation launched BEFORE it has an empty
-- column, so every one of them still opens with the host's launch values printed inside the
-- person's own message bubble ("Expert Goal: …", "Rulebook Document: # …"). The cold walk's
-- own interview, ee29ba15-63fe-4e22-adc4-0798909929f8, is one of them.
--
-- WHY THIS IS A REPLAY AND NOT A GUESS. The two surfaces that launch a purpose-built
-- conversation DECLARE their launch variables in code, by name, and a person has never had
-- a way to type any of them:
--
--   the Scout interview  `buildInterviewLaunchVariables` (features/masterwork/record/interviewModes.ts)
--                        rulebook_id · interview_context_mode · interview_probes ·
--                        interview_closing_surprises · expert_goal · rulebook_document
--   the Conductor        `ConductorPanel.tsx` runtime.variables
--                        rulebook_id · attachments · rulebook_document
--
-- So this file marks, on each conversation, exactly the names FROM THAT LIST that the row
-- actually holds. It invents nothing: a name the row does not carry is not added, and a
-- value the person typed under some other name is untouched and still shows as hers.
--
-- WHAT IT REFUSES TO TOUCH. Any row that already carries a recorded answer
-- (`host_value_names <> '{}'`) is left exactly as it is — a record beats an inference, and
-- this file must never overwrite what the browser actually observed.
--
-- REVERSIBLE AND NOT DESTRUCTIVE. It writes one array column that was empty. Nothing about
-- `variables`, resolution, the three-tier merge or any request changes; a host value still
-- wins over scope and default and still ships. Rolling back is
-- `update chat.conversation set host_value_names = '{}' where host_value_names <> '{}'`
-- for the rows this touched.

update chat.conversation c
set host_value_names = sub.names
from (
  select
    c2.id,
    array_agg(k order by k) as names
  from chat.conversation c2,
       lateral jsonb_object_keys(c2.variables) k
  where c2.host_value_names = '{}'::text[]
    and k in (
      -- the Scout interview's declared launch payload
      'rulebook_id',
      'interview_context_mode',
      'interview_probes',
      'interview_closing_surprises',
      'expert_goal',
      'rulebook_document',
      -- the Conductor's declared launch payload
      'attachments'
    )
  group by c2.id
) as sub
where c.id = sub.id
  and c.host_value_names = '{}'::text[];
