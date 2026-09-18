-- masterwork.drive — the five settings behind "interview me while I drive".
--
-- Arman, 2026-09-17: "No one has come to me and said, hey, we need to build a
-- really amazing interview while you drive page. So it's a little mobile page
-- that is specifically for extracting knowledge and expertise from someone
-- while they're driving somewhere. So it's net zero time."
--
-- The lane ships as `/masterwork/<id>/drive` (matrx-frontend
-- `features/masterwork/drive/`). Every behavioural choice it makes is a row
-- here rather than a constant in the page, per law 6 — and the FIRST of them,
-- `interviewer_mandate_key`, is the one the owner will actually want: which
-- interviewer conducts a drive. The page resolves a mandate key from this
-- setting and never names an agent, so pointing the lane at a different
-- interviewer — including one written specifically for voice — is a settings
-- change, not a deploy.
--
-- Pure DATA. No DDL, no new scope kind (the `rulebook` rung was registered by
-- aidream `0711_masterwork_interview_modes_are_knobs.sql`), so no type
-- regeneration is required.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AGENT-SET VALUES UNDER BLIND APPROVAL (set_by = 'agent'; Arman has NOT
-- reviewed these numbers; review due 2026-12-17).
--
-- `interviewer_mandate_key` default `masterwork.scout` — the interviewer the
-- Rulebook's own "Talk it through" lane already uses, so a drive is the SAME
-- interview the Expert would have had at her desk, in the same conversation
-- shape, landing on the same Rulebook. Naming a different mandate here swaps
-- the interviewer for one Rulebook, one person, one organization, or the
-- platform. Not `enum`: the mandate vocabulary is declared on the server and
-- an allow-list copied here would go stale the day a new interviewer ships.
--
-- `resume_window_minutes` default 180. A drive interview must survive a
-- tunnel, a screen lock, an incoming call and the phone killing the tab —
-- inside the window, reopening the page continues the SAME conversation, and
-- past it a fresh one is less strange than resuming mid-sentence. Three hours
-- covers a long drive plus the stop in the middle of it; it is a knob because
-- a delivery driver's day and a consultant's airport run are not the same
-- session.
--
-- `voice_commands` default true. The whole promise is one tap and then hands
-- on the wheel, so "pause", "carry on" and "I'm done" are honoured as
-- commands. Matching is deterministic and deliberately narrow (a command must
-- be a short whole phrase), but any keyword matcher can fire on a sentence its
-- author did not imagine — so an Expert who gets cut off once must be able to
-- turn it off without anyone shipping code.
--
-- `auto_reconnect` default true. Table stakes: a dropped realtime socket
-- reconnects itself rather than leaving a driver to notice silence and look
-- at a screen. Off exists for anyone metering data or debugging the lane.
--
-- `spoken_status` default true. "Nothing to read while moving" is the point of
-- the lane, so connection changes are SAID, not shown. Off for a passenger who
-- would rather read the status than hear it interrupt the interview.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, propagation)
VALUES
  ('masterwork.drive', 'interviewer_mandate_key',
   '"masterwork.scout"', '"masterwork.scout"', 'string', null, null, null, null,
   'Who interviews you while you drive',
   'The interviewer that runs a hands-free driving interview. By default it is '
   'the same one that interviews you at your desk, so a drive is simply that '
   'interview with your hands on the wheel — same questions, same rulebook, same '
   'record of what you said. Point this at a different interviewer when you want '
   'driving sessions handled by someone else.',
   'agent',
   'Arman, 2026-09-17: "we need to build a really amazing interview while you '
   'drive page... it''s net zero time." The lane reuses the existing Masterwork '
   'interviewer rather than inventing one, because agent instructions are the '
   'owner''s to write (HUNTER-RULES law 5) and the page must not hardcode an '
   'agent (the no-hardcoded-agents law). Kept as a free string rather than an '
   'enum so a newly declared interviewer can be selected the day it exists. '
   'Arman has not reviewed this default.',
   date '2026-12-17', '{organization,user,rulebook}', 'any', 'next_load'),

  ('masterwork.drive', 'resume_window_minutes',
   '180', '180', 'number', 'minutes', 1, 10080, null,
   'How long a paused drive stays the same interview',
   'If you lose signal, lock your phone, take a call, or just stop for coffee, '
   'reopening the page picks the interview straight back up where it was — '
   'nothing you said is lost. After this long it starts a fresh interview '
   'instead, because carrying on mid-sentence days later is stranger than '
   'beginning again.',
   'agent',
   'A drive is one errand: three hours covers a long leg plus the stop in the '
   'middle of it. Below the window the conversation is continued by id, so the '
   'Expert''s earlier turns are still in it; above it a new conversation is '
   'created and associated with the Rulebook exactly as any other interview is. '
   'A knob because a delivery route and an airport run are not the same session. '
   'Ceiling is one week. Arman has not reviewed this default.',
   date '2026-12-17', '{organization,user,rulebook}', 'any', 'next_load'),

  ('masterwork.drive', 'voice_commands',
   'true', 'true', 'boolean', null, null, null, null,
   'Let you pause and finish by talking',
   'With this on you can say "pause", "hold on", "carry on" or "I''m done" and '
   'the interview does it — you never have to look at or touch the phone after '
   'you start. With it off the only controls are the buttons on screen.',
   'agent',
   'The lane''s promise is one tap and then hands on the wheel. Matching is '
   'deterministic and narrow — a command must be a short whole phrase, so '
   '"we paused the excavation for two days" is never read as a command (guard: '
   'features/masterwork/drive/__tests__/voiceCommands.test.ts). But no keyword '
   'table survives every sentence its author did not imagine, and being cut off '
   'mid-story is the worst thing this lane can do, so an Expert can turn it off '
   'without waiting for a release. Arman has not reviewed this default.',
   date '2026-12-17', '{organization,user,rulebook}', 'any', 'next_load'),

  ('masterwork.drive', 'auto_reconnect',
   'true', 'true', 'boolean', null, null, null, null,
   'Reconnect by itself when the signal comes back',
   'Driving means tunnels and dead spots. With this on, the interview tells you '
   'out loud that it is reconnecting and gets itself back as soon as it can, so '
   'you carry on talking. With it off it stops and waits for you to start it '
   'again.',
   'agent',
   'Table stakes (`policies/table-stakes-are-never-a-question.md`): reconnect '
   'and auto-resume are always yes. It is still a knob so a passenger metering '
   'data, or anyone debugging the lane, can stop it retrying. The page NEVER '
   'pretends to be listening while it is not — reconnecting is announced either '
   'way. Arman has not reviewed this default.',
   date '2026-12-17', '{organization,user,rulebook}', 'any', 'next_load'),

  ('masterwork.drive', 'spoken_status',
   'true', 'true', 'boolean', null, null, null, null,
   'Say what is happening instead of showing it',
   'Connection changes — reconnecting, back, saved — are spoken out loud rather '
   'than written on screen, so there is nothing to read while you are moving. '
   'Turn it off if you would rather glance at the screen than be interrupted.',
   'agent',
   '"Nothing to read while moving" is the whole design of this lane; a status '
   'line a driver has to look at defeats it. The screen still shows the same '
   'state in large high-contrast type for a passenger or a stopped car — this '
   'knob decides whether it is also said. Arman has not reviewed this default.',
   date '2026-12-17', '{organization,user,rulebook}', 'any', 'next_load')
ON CONFLICT (feature, key) DO NOTHING;

-- ── PARITY BLOCK — the migration proves its own outcome or rolls back ────────
DO $$
DECLARE
  v_count integer;
  v_bad text;
BEGIN
  SELECT count(*) INTO v_count
    FROM platform.feature_knob WHERE feature = 'masterwork.drive';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 masterwork.drive knobs, found %', v_count;
  END IF;

  -- Every one of them must be answerable at the three rungs the lane resolves
  -- for, or the layering the page reads silently does not exist.
  SELECT string_agg(key, ', ') INTO v_bad
    FROM platform.feature_knob
   WHERE feature = 'masterwork.drive'
     AND NOT ('organization' = ANY(overridable_by)
              AND 'user' = ANY(overridable_by)
              AND 'rulebook' = ANY(overridable_by));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'these drive knobs are not org+user+rulebook overridable: %', v_bad;
  END IF;

  -- The rulebook rung must already exist, or every one of these resolves at the
  -- organization level and a per-Rulebook answer is quietly impossible.
  IF NOT EXISTS (SELECT 1 FROM platform.knob_scope_kind WHERE kind = 'rulebook')
  THEN
    RAISE EXCEPTION
      'the rulebook knob scope kind is missing — aidream migration '
      '0711_masterwork_interview_modes_are_knobs.sql must land first';
  END IF;

  -- The interviewer is resolved BY MANDATE KEY. A null or empty default would
  -- put the page in its "failed" state for everyone, on purpose but uselessly.
  IF coalesce(
       (SELECT value ->> 0 FROM platform.feature_knob
         WHERE feature = 'masterwork.drive'
           AND key = 'interviewer_mandate_key'),
       (SELECT value #>> '{}' FROM platform.feature_knob
         WHERE feature = 'masterwork.drive'
           AND key = 'interviewer_mandate_key'),
       '') = '' THEN
    RAISE EXCEPTION
      'masterwork.drive.interviewer_mandate_key has no value — the drive lane '
      'resolves its interviewer from it and would refuse for everyone';
  END IF;
END $$;
