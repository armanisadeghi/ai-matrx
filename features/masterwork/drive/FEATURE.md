# FEATURE.md — `masterwork/drive` (local mechanics only)

**Interview me while I drive.** The hands-free capture lane of a Rulebook:
`/masterwork/<id>/drive`, reached by the short link `/drive` (or
`/drive?r=<id>`) that a person texts themselves, and by a door on "Your words".

Arman, 2026-09-17: *"a little mobile page that is specifically for extracting
knowledge and expertise from someone while they're driving somewhere. So it's
net zero time."*

Product truth for the Masterwork node lives in
`../../../../common-docs/systems/masterwork/`; the voice system of record is
`../../../../common-docs/systems/agents/voice/STATE.md`. Below is only what an
agent editing THIS directory must not get wrong.

## Map

| File | What it is |
|---|---|
| `DriveInterviewPage.tsx` | The whole surface: the start screen, the live session, the status sentence, the dark chrome. |
| `driveSession.ts` | Pure resume core + device memory + `driveLauncherFreshness`. No React. |
| `voiceCommands.ts` | Deterministic "pause / carry on / I'm done" matcher over the transcript. No React, no model. |
| `useDriveSettings.ts` | The five `masterwork.drive` knobs, ladder-resolved (platform → org → user → rulebook). |
| `DriveLinkButton.tsx` | The copy-the-link control the record screen renders. Its own module on purpose. |
| `__tests__/` | The guards. |

Routes: `app/(core)/masterwork/[id]/drive/page.tsx` (on `RulebookLaneRoute`),
`app/(core)/drive/page.tsx` (the short link).
Knobs migration: `migrations/masterwork_drive_lane_knobs.sql`.

## The four things this lane must never lose

1. **It invents no interviewer.** The agent is resolved by Mandate from
   `masterwork.drive.interviewer_mandate_key` (default `masterwork.scout`).
   **Never put an agent id, a persona, or instructions in this directory** —
   those are the owner's to write, and swapping the interviewer (including for
   one written specifically for voice) must stay a settings change.
2. **It builds no second voice stack and no second way to save.** Voice is
   `features/voice-agent/relay/` — the same Communicator relay the Scout panel
   and the Conductor mount. The conversation is an ordinary execution-system
   conversation, landed on the Rulebook by
   `record/service.ts::associateInterviewWhenPersisted`, so a drive appears in
   "Your words" with its timestamps like any other interview. A drive that
   saved its own way would be invisible to the corpus the Final Checkup reads.
3. **A fresh drive never adopts whatever the app last focused.** The launcher
   resolves `focusedConversationId ?? mint()`, so a drive with no explicit id
   silently continues the last conversation the app had open — found live on
   this lane's first run, on a brand-new Rulebook. `driveLauncherFreshness` is
   the one place that decides; never inline the options at the call site.
4. **Nothing on the screen may be read while moving.** No transcript, no list,
   no chrome that rewards a glance. Status is one sentence in large
   high-contrast type AND said out loud (`masterwork.drive.spoken_status`).
   Every control is 88px tall; the shell carries `matrx-touch-targets`.

## The honest limit — say it, never paper over it

This is mobile web. iOS suspends a backgrounded tab's audio pipeline, so when
the driver leaves the browser or the screen locks, capture stops. The page
does not pretend otherwise: it detects the lost session, says "Reconnecting —
I'm not hearing you right now", reconnects itself with backoff
(`masterwork.drive.auto_reconnect`), and **resumes the same conversation** so
nothing already said is lost.

What a native client in `aidream/mobile/` would add: true background audio, a
lock-screen transport control, CarPlay, and Siri hand-off ("hey Siri, interview
me about the septic rulebook"). That directory is an empty reserved layout
today — see `../../../../common-docs/policies/native-mobile-layout.md`.

## Guards

`__tests__/driveSession.test.ts` and `__tests__/voiceCommands.test.ts`, plus
the platform-level `features/voice-agent/relay/utteranceQueue.test.ts`. Each
carries an executable description of the behaviour it replaced, so the guard
can be watched failing without a commit archaeology trip. The voice-command
suite's most important half is the NEGATIVE one: a false positive cuts an
Expert off mid-story, which is the worst thing this lane can do.

## Change Log

- **2026-09-17** — Lane created. Five knobs registered and applied live. Three
  guards proven failing then passing. Verified at 390px as `admin@admin.com`
  against a brand-new Rulebook: settings, both Mandates, the broker realtime
  credential and realtime tool resolution all fire; a reload offers "Pick up
  where you left off" and adopts the real conversation id. **Speech in and out
  is NOT yet proven** — the headless browser blocks microphone capture, so a
  human must drive one real session end to end.
