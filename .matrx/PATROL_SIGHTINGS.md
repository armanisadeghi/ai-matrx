# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P7 | app/(dev)/demos + app/(transitional)/_apps/app-builder + app/(admin)/administration/ui/official-components (~15 files) | remaining bare alert/confirm/prompt tail — all in D67's documented demo/app-builder backlog; features/ + components/ + live admin are now clean (2026-08-09 batch). App-builder unsaved-changes confirms may sit in sync router guards — verify before making them async | 2026-08-09
- [ ] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08
- [ ] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08
- [ ] P4 | 44 files: `bg-white`/`text-black` with no `dark:` anywhere in file | strongest light-only candidates (282 total need per-line triage) | 2026-08-08
- [ ] P1 | /marketing/.../keywords Performance tab | renders 'No search queries stored yet' empty state while v_site_keyword_performance returns HTTP 500 — error laundered into fake empty state (spawn chip filed); found during brand-alias drawer fix | 2026-08-09

## Cleared

- [x] P7 | (2 files, grep window.* dialogs in features/components/app) | fixed 2026-08-09 — sweep found and replaced bare dialogs in 16 features/components files + 1 live admin page (toast / confirm host / announceComingSoon); the demo/app-builder tail is re-logged above | 2026-08-09
