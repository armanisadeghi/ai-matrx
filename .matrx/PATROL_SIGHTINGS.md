# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P7 | (2 files, grep `window.confirm\|window.alert\|window.prompt` in features/components/app) | last 2 browser-dialog files in the repo — finish the eradication | 2026-08-08
- [ ] P4 | 44 files: `bg-white`/`text-black` with no `dark:` anywhere in file | strongest light-only candidates (282 total need per-line triage) | 2026-08-08

## Cleared

- [x] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08 | fixed (2026-08-09 sweep: 4 youtube-discovery files min-h-screen→min-h-dvh, YouTubeSearchHistory + WarRoomShell + RunControlsMenu calc(100vh…)→calc(100dvh…); WarRoomShell got unit swap only — full header conformance stays with docs/handoffs/war-room-list-and-room-conformance.md)
- [x] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08 | fixed (2026-08-09 sweep: safe-area padding added to EditTabLayout bottom bar, ui/toast viewport, SetBuilder mobile slide-over, MessagingSideSheet, MobileLayout sidebar nav; NotesFilterSheet/BottomSheet/CanvasShareSheet/MatrxDynamicPanel already compliant; dev resizable panels + MatrxPanel have zero consumers — skipped as dead code)
