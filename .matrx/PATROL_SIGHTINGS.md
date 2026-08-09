# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P7 | 32 files (44 executable calls; see `.matrx/patrol-reports/no-browser-dialogs.md`) | 27 alerts are future Tier M batches; 16 confirms and 1 prompt require Tier R review | 2026-08-09
- [ ] P4 | 44 files: `bg-white`/`text-black` with no `dark:` anywhere in file | strongest light-only candidates (282 total need per-line triage) | 2026-08-08

## Cleared

- [x] P7 | (2 files, grep `window.confirm\|window.alert\|window.prompt` in features/components/app) | last 2 browser-dialog files in the repo — finish the eradication | 2026-08-08 — STALE
- [x] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08 | fixed (2026-08-09 sweep: 4 youtube-discovery files min-h-screen→min-h-dvh, YouTubeSearchHistory + WarRoomShell + RunControlsMenu calc(100vh…)→calc(100dvh…); WarRoomShell got unit swap only — full header conformance stays with docs/handoffs/war-room-list-and-room-conformance.md)
- [x] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08 | fixed (2026-08-09 sweep: safe-area padding added to EditTabLayout bottom bar, ui/toast viewport, SetBuilder mobile slide-over, MessagingSideSheet, MobileLayout sidebar nav; NotesFilterSheet/BottomSheet/CanvasShareSheet/MatrxDynamicPanel already compliant; dev resizable panels + MatrxPanel have zero consumers — skipped as dead code)
- 2026-08-09 · loud-recovery/dead-end · /marketing/.../keywords Performance tab renders 'No search queries stored yet' empty state while v_site_keyword_performance returns HTTP 500 — error laundered into fake empty state (spawn chip filed) · found during brand-alias drawer fix

- 2026-08-09 — **Patrol candidate (nominated):** 14 `components/ui/*` shadcn wrappers gate their Radix Root on `useIsMounted` and `return null`, blanking always-visible triggers/tabs/nav until hydration. Grep: `useIsMounted` + `return null` under `components/ui/`. Evidence + why the stated justification is false: FOUND_DEFECTS D144. Found while fixing the context-menu instance during the Inventory Law sweep (PR #72).
