# Meet state scenarios (MD-06)

Real browsers, real LiveKit Cloud, the real local app: one scenario per P0 and P1 state in
`common-docs/systems/communications/meet/duplicates/states-catalog.json`, asserting what each
person SEES through the observation contract (`HARNESS-CONTRACT.md` beside the catalog), plus
server truth where the catalog asks for it (the token door, the meeting row, the LiveKit room).

    bash tests/meet-scenarios/run.sh                 # every scenario (P0 + P1), Chromium
    MEET_SET=p1 bash tests/meet-scenarios/run.sh     # only the P1 files (scenarios/p1-<category>.spec.ts); MEET_SET=p0 = the rest
    bash tests/meet-scenarios/run.sh wr-denied       # one state id
    MEET_NO_PROXY=1 MEET_BROWSERS=webkit bash tests/meet-scenarios/run.sh wr-denied   # needs: pnpm exec playwright install webkit

WebKit runs only without the per-person proxy (`MEET_NO_PROXY=1`; through the proxy WebKit never
finishes loading the app), so network-cut scenarios are Chromium-only for now.

**Each run writes to its own directory**: `.cache/meet-scenarios/runs/<run-id>/` (`report.md`,
`report.json`, `artifacts/`, `teardown/`). The id is printed at the start; two runs at once never
collide. Set `MEET_RUN_ID` to name a run. Before a run: `uptime` load under 60, `/meetings` answers
200, and keep `MEET_WORKERS` at 2 or less on the shared machine.

Knobs (real-time waits): `MEET_KNOCK_EXPIRY_S`, `MEET_HOST_TRANSFER_S`, `MEET_EMPTY_END_S`,
`MEET_GIVE_UP_S`, `MEET_NOTICE_S`, `MEET_WORKERS`. `MEET_SCENARIOS_DIR` points a run at a scratch
copy of the scenarios (mutation proofs) — never edit the real ones to prove a guard.

## Proving SERVER changes before a release: `MEET_SERVER=local`

The shared frontend (port 3001) calls the production API, so by default a run proves whatever is
DEPLOYED. To prove the current aidream `main` code without waiting for a release:

    bash tests/meet-scenarios/local-api.sh start     # reuses the matrx-dev API on :8000 if it answers; else starts one on :8123 (boot 4-8 min)
    MEET_SERVER=local bash tests/meet-scenarios/run.sh rec-start-notice
    bash tests/meet-scenarios/local-api.sh stop      # stops only the process the script started (exact PID)

Each person's browser context routes every request for `https://server.app.matrxserver.com/**` to the
local server (Playwright `context.route`); the frontend code is unchanged, and no second frontend is started.
The end-meeting backstop uses the same server. The API uses aidream's `.env`: **same database and LiveKit Cloud
as production, on purpose**. State and log: `.cache/meet-scenarios/local-api/`. Knobs: `MEET_LOCAL_API_URL`,
`MEET_LOCAL_API_SHA`, `MEET_LOCAL_API_PORT`.

Every report's header says `API SERVER: LOCAL aidream <url> running git <sha> ... Not production proof.`
(or `PRODUCTION`), and each person's levers show how many requests the local server answered. A
`MEET_SERVER=local` run is never production proof; re-run on production after the release for that.

**Limits.**
- LiveKit webhooks (participant joined/left, room finished) and every deadline job (host-transfer, empty-end,
  knock expiry, give-up) fire against PRODUCTION: LiveKit Cloud's webhook URL and the production worker/queues
  are fixed, and the local stack must never run the workflow or LiveKit workers (they would claim production jobs).
  A scenario whose verdict depends on a webhook or a deadline job is therefore judged by production code for that
  part; the report says so and the scenario must name it. Only the HTTP doors (token, join, leave, end, policy,
  recording start) are answered by the local code.
- The routed response is buffered (no streaming), so a streamed endpoint behaves as a plain response.
- Server code that is not on aidream `main` HEAD is not tested; the SHA in the report is the checkout HEAD
  recorded at start (a reused :8000 process may be older: restart it first).

## People

- **host** — admin@admin.com through `pnpm dev-login`.
- **org member** — a realistic persona from aidream's persona factory (`aidream/testing/persona.py`,
  tagged `test_fixture` with a 3 h expiry), made a member of the meeting's organization and signed
  in through the product's own emailed-link door (`/auth/confirm`). Made and removed by
  `lib/fixtures.py` (run in aidream's environment); teardown is detached and logged under the run.
- **member** (`seat: "member"`) — test@test.com, an OUTSIDER to the host's organization.
- **guests** — signed out ("Priya Shah", "Daniel Okafor").

## Results: PASS, FAIL, UNPROVEN, ENV

- **FAIL** is the default for any failure: a product timeout, a hung page, a crashed page, the
  app's error page.
- **UNPROVEN** is a scenario saying its own product verdict cannot be produced right now (its
  precondition is unreachable, e.g. autoplay-blocked when the browser never blocked the audio). It
  is neither pass nor fail, carries the reason, and the summary counts it separately. A scenario
  declares it with `unproven(reason)` from `lib/scenario.ts`. A no-gesture person (autoplay) gets
  one init script: a DOM node passed to `console.*` is logged as its tag name, because Playwright's
  element preview of that argument grants the page user activation (found 2026-10-09).
- **ENV** only when the run's own evidence proves the environment within 3 minutes of the failure:
  a walk-cap park ("Resume this preview"), or the dev server answering 5xx for a page, a chunk or
  the sign-in door, or a compile error on screen. Those lines start with `ENV:` in the timeline.
  An ENV row is never a verdict; rerun it on a quiet server.

## What every run records (the done-oracle)

The report header is computed per run from each person's recorded levers: browser and version,
launch args, fake devices (Chromium's fake camera/microphone), any init script (the media-fault
script is installed ONLY for a scenario that asks for faults), permission grants or blocks (the
browser's own store), the per-person proxy, and the observation source per row (`contract` or the
visible-text `fallback`). It also reports what the pages actually loaded: script count, any script
whose name looks like a test driver / jsdom / mock, the build mode the served scripts reveal
(dev-server HMR client and React development build, or production), and any query string on a page
load. Nothing is asserted that was not recorded; with no pages loaded the line says so.

## Skins (per-brand coverage)

Every scenario runs once per registered skin: one Playwright project per browser x skin, and the
report has a Skin column. `lib/skins.ts` holds the registry; only `meet` exists today. Choose with
`MEET_SKINS=meet` (comma list; the default). A name that is not registered is an error. When
zoom, teams or ours ship their routes, add ONE entry to `SKINS` (start path, meeting path, meeting
URL pattern, invalid-code path) and `MEET_SKINS=meet,zoom bash tests/meet-scenarios/run.sh` runs
every scenario for both. Project names: `chromium` for `meet`, `chromium-<skin>` otherwise.

## Behavior profiles (Zoom/Teams rules) are per meeting, never per account

A scenario that needs non-default rules creates its meeting with `createMeetingWithProfile(host, "zoom")`
(`lib/meeting.ts`): the product's scheduling door `meet_schedule_meeting` with `behavior_profile` in its
settings, which sets the meeting's OWN `behavior_profile` column. Never write a user-level
`meet.behavior_profile` override on admin@admin.com: it applies to every meeting that account starts, so
any other lane's run starting meanwhile runs under those rules too. The run-start check reads admin's
user-level overrides; if one is held it clears it through `meet_policy_set` (NULL value) and fails ENV
setup only if it will not clear.

## Environment, never product

The shared dev server caps concurrent signed-in preview hosts (`utils/supabase/walkCap.ts`,
Arman-approved; never change or bypass it). The harness puts every signed-in context on ONE
preview host and, for the WHOLE test (every wait, with or without an open tab), sends the walk's
explicit-activity request every 30 s through a signed-in person's browser context. A guest is signed
out, so the middleware never parks it; it is parked only because the host's eviction is broadcast to
every tab on that host (SSE), which is why keeping the host active protects the guest too. If a tab
in a live meeting is parked anyway, Resume cannot bring the call back (it reloads pre-join): the
harness resumes, records a fatal ENV event and fails the run as ENV, never PASS or FAIL.

## Cleanup (no meeting left open)

Every meeting a run creates is tracked (`Cast.created`). At the end of each scenario a final sweep
ends each one still live: UI first, then the backstop calls `POST /api/v1/meet/end` exactly as the
product's page does (bearer, `X-Organization-Id`, browser User-Agent so Cloudflare does not answer
1010). A backstop that fails, or leaves the meeting live, is never swallowed: the report gets a
`CLEANUP FAILURES` section with the HTTP status and the headline counts them.

## P1 scenarios (`scenarios/p1-<catalog category>.spec.ts`, helpers in `lib/p1.ts`)

One scenario per P1 state id (63 files-worth here; `wr-denied-reknock` is the three `reknock_after_deny` variants in
`waiting-room.spec.ts`). Written from the catalog's `requirement` and CORE-DESIGN §11's honest screen, never from the code, so
most are RED until the core and a skin render the contract. Where the products differ the scenario creates its meeting with the
profile through `meet_schedule_meeting` (`createMeetingWithProfile` / `scheduleMeeting`) — never a user-level profile.

Levers a P1 scenario may add, each recorded on the person's timeline: an init script that removes or breaks a device
(`device-none-found`, `device-busy`, `perm-prompt-pending`), a canvas-stream screen source standing in for the share picker
(`shareSourceInit`: the picker cannot be driven headless; the product publishes a real track), a mobile user agent.

**UNPROVEN by design** (the browser cannot produce the situation; each says so in its report row):
`plan-concurrency-limit`, `gallery-paging`, `mobile-background-camera`, `mobile-call-interrupt`, `codec-ua-gating`; and by
precondition, at run time: `tab-hidden-throttle` (page never became hidden), `captions-unavailable` (captions worked),
`link-expired` (scheduling door refuses a start in the past). Parts not covered: PSTN/SIP labels in
`participant-roster-hidden-kinds`; the meeting-pass refresh in `token-expiry` (6 h, organization-level knob; only the
10-minute room credential is exercised); `rec-auto-stop` exercises the cap path (1 minute via `max_recording_minutes`), not the 8 h wait.
