# Meet state scenarios (MD-06)

Real browsers, real LiveKit Cloud, the real local app: one scenario per P0 state in
`common-docs/systems/communications/meet/duplicates/states-catalog.json`, asserting what each
person SEES through the observation contract (`HARNESS-CONTRACT.md` beside the catalog).

    bash tests/meet-scenarios/run.sh                 # every P0 scenario, Chromium
    bash tests/meet-scenarios/run.sh wr-denied       # one state id
    MEET_BROWSERS=chromium,webkit bash tests/meet-scenarios/run.sh   # needs: pnpm exec playwright install webkit

Report: `.cache/meet-scenarios/report.md` (table + every person's timeline) and `report.json`.
Knobs (real-time waits): `MEET_KNOCK_EXPIRY_S`, `MEET_HOST_TRANSFER_S`, `MEET_EMPTY_END_S`,
`MEET_GIVE_UP_S`, `MEET_NOTICE_S`, `MEET_WORKERS`.

## Environment, never product

The shared dev server caps concurrent signed-in preview hosts (`utils/supabase/walkCap.ts`,
Arman-approved; never change or bypass it). The harness puts every signed-in context on ONE
preview host, pings the walk's explicit-activity endpoint to stay active, and on a parked page
presses "Resume this preview" and continues. **A park, a dev-server restart or a page the server
failed to serve is environment, never a product failure**: the report marks such a scenario `ENV`,
not `FAIL`, and its timeline lines start with `ENV:`.
