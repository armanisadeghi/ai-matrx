# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P7 | 32 files (44 executable calls; see `.matrx/patrol-reports/no-browser-dialogs.md`) | 27 alerts are future Tier M batches; 16 confirms and 1 prompt require Tier R review | 2026-08-09
- [ ] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08
- [ ] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08
- [ ] P4 | 44 files: `bg-white`/`text-black` with no `dark:` anywhere in file | strongest light-only candidates (282 total need per-line triage) | 2026-08-08
- [ ] P1 | 23 files / 25 sites via `addEventListener("mousedown"…)` + `.contains(` | PATROL CANDIDATE (new class): a hand-rolled outside-click dismisser treats a PORTALLED overlay as "outside", so any peek/dialog opened from inside it closes its own container, unmounts the control that owns it, and eats the click — the door deletes itself when used. Shipped on `/lists/v2`, fixed there with a `.closest('[role="dialog"]')` guard; the other 22 files are the same trap the moment a door is added to them. Statically decidable, invisible to type-check. | 2026-08-09
- [ ] P2 | features/war-room/components/resources/WarRoomResourcesList.tsx | second implementation of AssociationList's grouped row list; `<AssociationList>` now has ZERO live JSX consumers while three war-room docblocks still call it "the canonical `<AssociationList>`" — collapse the fork or retire one | 2026-08-09

## Cleared

- [x] P7 | (2 files, grep `window.confirm\|window.alert\|window.prompt` in features/components/app) | last 2 browser-dialog files in the repo — finish the eradication | 2026-08-08 — STALE
- 2026-08-09 · loud-recovery/dead-end · /marketing/.../keywords Performance tab renders 'No search queries stored yet' empty state while v_site_keyword_performance returns HTTP 500 — error laundered into fake empty state (spawn chip filed) · found during brand-alias drawer fix
