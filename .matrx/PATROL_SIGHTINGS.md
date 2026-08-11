# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P4 | `.matrx/patrol-reports/light-dark-integrity-exception-review.md` | 52 files / 109 raw-token lines are proposed fixed-palette exceptions; none is approved and every proposal needs Arman's UI decision | 2026-08-11
- [ ] P4 | `features/applet/home/app-display/ModernGlass.tsx:93-94` | proposed exception has no stable/current render path, so it cannot be approved until a Tier-C review harness exists | 2026-08-11
- [ ] P4 | `components/mardown-display/markdown-classification/custom-views/view-components/CandidateProfileView.tsx:209,211` | two white-alpha skeleton bars disappear on the pale light-theme header; attempted semantic-token batch was fully reverted after certification rejection | 2026-08-11
- [ ] P4 | `features/war-room/components/room/RoomHeader.tsx:657` | mobile action-sheet row uses white-alpha active/border chrome on a normal theme surface; attempted semantic-token batch was fully reverted after certification rejection | 2026-08-11
- [ ] P7 | see `.matrx/patrol-reports/no-browser-dialogs.md` — **remaining baseline is STALE, needs a re-count** | The report's 32-files/44-calls figure predates the 2026-08-09 UI-hygiene batch (PR #79), which independently cleared 16 files across `features/` + `components/` plus `/administration/compute/sandbox-infra` (Tier R confirms included: converted to the async `confirm({...})` host). The two code-editor files were fixed by BOTH runs — deduped on merge. Surviving tail is concentrated in `app/(dev)/demos`, `app/(transitional)/_apps/app-builder`, and admin official-components display demos; app-builder unsaved-changes confirms may sit in sync router guards, so verify before making them async | 2026-08-09
- [ ] P8 | see `.matrx/patrol-reports/real-loading-states.md` | first/full Tier R pass verified 95 files: 45 standard-loader candidates and 50 skeleton/design cases; 0 fixed until the P8 fix skill exists | 2026-08-10

## Cleared

- [x] P4 | `components/errors/ErrorBoundaryView.tsx:121` | shared CopyButton uses `hover:bg-white/10` on both dark code and neutral light surfaces; light-mode hover is effectively invisible | 2026-08-11 | fixed-certified (theme surfaces now use `hover:bg-accent`; the fixed dark stack surface explicitly opts into stable on-dark chrome; adversarial verdict CERTIFIED)
- [x] P4 | 282 total `bg-white`/`text-black` files still need per-line triage | 2026-08-08 | superseded-and-reopened (the corrected property-specific 2026-08-11 pass found 150 unpaired lines; its earlier agent-cleared exception decisions were invalid under the new human-owned exception contract, and the unresolved set is now tracked under Open)
- [x] P7 | (2 files, grep `window.confirm\|window.alert\|window.prompt` in features/components/app) | last 2 browser-dialog files in the repo — finish the eradication | 2026-08-08 — STALE (the two-file count was wrong; superseded by the full patrol report + the 2026-08-09 batch above)
- [x] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08 | fixed (2026-08-09 sweep: 4 youtube-discovery files min-h-screen→min-h-dvh, YouTubeSearchHistory + WarRoomShell + RunControlsMenu calc(100vh…)→calc(100dvh…); WarRoomShell got unit swap only — full header conformance stays with docs/handoffs/war-room-list-and-room-conformance.md)
- [x] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08 | fixed (2026-08-09 sweep: safe-area padding added to EditTabLayout bottom bar, ui/toast viewport, SetBuilder mobile slide-over, MessagingSideSheet, MobileLayout sidebar nav; NotesFilterSheet/BottomSheet/CanvasShareSheet/MatrxDynamicPanel already compliant; dev resizable panels + MatrxPanel have zero consumers — skipped as dead code)
- 2026-08-09 · loud-recovery/dead-end · /marketing/.../keywords Performance tab renders 'No search queries stored yet' empty state while v_site_keyword_performance returns HTTP 500 — error laundered into fake empty state (spawn chip filed) · found during brand-alias drawer fix
- 2026-08-09 — **Patrol candidate (nominated):** 14 `components/ui/*` shadcn wrappers gate their Radix Root on `useIsMounted` and `return null`, blanking always-visible triggers/tabs/nav until hydration. Grep: `useIsMounted` + `return null` under `components/ui/`. Evidence + why the stated justification is false: FOUND_DEFECTS D144. Found while fixing the context-menu instance during the Inventory Law sweep (PR #72).
- [x] P4 | 44-file no-`dark:` batch (re-grep found 63) | historical code-fix batch completed, but its agent-declared “legitimate” exceptions are superseded and reopened under the human-owned exception contract; no old skip is trusted as approval | 2026-08-09
- 2026-08-10 — **Patrol candidate (nominated): spinner-while-AI-works.** ~50 client agent-run call sites show only a spinner/disabled button while the model streams (server always streams; clients discard it). Grep: `useHeadlessAgentJson`/`runHeadlessAgentJson` consumers that never read `activeRequestId`/`conversationId`; `useRunAgent` without `onChunk`. Fix recipe + full worklist: docs/handoffs/live-stream-everywhere.md (primitives `useLiveAgentRun` + `<LiveRunDisplay>` shipped 2026-08-10). Found during the platform-wide live-streaming gap analysis.
