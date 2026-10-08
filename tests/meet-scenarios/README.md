# Meet state scenarios (MD-06)

Real browsers, real LiveKit Cloud, the real local app: one scenario per P0 state in
`common-docs/systems/communications/meet/duplicates/states-catalog.json`, asserting what each
person SEES through the observation contract (`HARNESS-CONTRACT.md` beside the catalog), plus
server truth where the catalog asks for it (the token door, the meeting row, the LiveKit room).

    bash tests/meet-scenarios/run.sh                 # every P0 scenario, Chromium
    bash tests/meet-scenarios/run.sh wr-denied       # one state id
    MEET_BROWSERS=webkit bash tests/meet-scenarios/run.sh wr-denied   # needs: pnpm exec playwright install webkit

**Each run writes to its own directory**: `.cache/meet-scenarios/runs/<run-id>/` (`report.md`,
`report.json`, `artifacts/`, `teardown/`). The id is printed at the start; two runs at once never
collide. Set `MEET_RUN_ID` to name a run. Before a run: `uptime` load under 60, `/meetings` answers
200, and keep `MEET_WORKERS` at 2 or less on the shared machine.

Knobs (real-time waits): `MEET_KNOCK_EXPIRY_S`, `MEET_HOST_TRANSFER_S`, `MEET_EMPTY_END_S`,
`MEET_GIVE_UP_S`, `MEET_NOTICE_S`, `MEET_WORKERS`. `MEET_SCENARIOS_DIR` points a run at a scratch
copy of the scenarios (mutation proofs) — never edit the real ones to prove a guard.

## People

- **host** — admin@admin.com through `pnpm dev-login`.
- **org member** — a realistic persona from aidream's persona factory (`aidream/testing/persona.py`,
  tagged `test_fixture` with a 3 h expiry), made a member of the meeting's organization and signed
  in through the product's own emailed-link door (`/auth/confirm`). Made and removed by
  `lib/fixtures.py` (run in aidream's environment); teardown is detached and logged under the run.
- **member** (`seat: "member"`) — test@test.com, an OUTSIDER to the host's organization.
- **guests** — signed out ("Priya Shah", "Daniel Okafor").

## Results: PASS, FAIL, ENV

- **FAIL** is the default for any failure: a product timeout, a hung page, a crashed page, the
  app's error page.
- **ENV** only when the run's own evidence proves the environment within 3 minutes of the failure:
  a walk-cap park ("Resume this preview"), or the dev server answering 5xx for a page, a chunk or
  the sign-in door, or a compile error on screen. Those lines start with `ENV:` in the timeline.
  An ENV row is never a verdict; rerun it on a quiet server.

## What every run records (the done-oracle)

The report header is computed per run from each person's recorded levers: browser and version,
launch args, fake devices (Chromium's fake camera/microphone), any init script (the media-fault
script is installed ONLY for a scenario that asks for faults), permission grants or blocks (the
browser's own store), the per-person proxy, and the observation source per row (`contract` or the
visible-text `fallback`). No fake meeting driver, jsdom, test-only build or product flag is used.

## Environment, never product

The shared dev server caps concurrent signed-in preview hosts (`utils/supabase/walkCap.ts`,
Arman-approved; never change or bypass it). The harness puts every signed-in context on ONE
preview host, pings the walk's explicit-activity endpoint to stay active, and on a parked page
presses "Resume this preview" and continues (recorded as ENV evidence).
