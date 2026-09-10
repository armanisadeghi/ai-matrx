---
status: active
updated: 2026-09-10
repos: [matrx-frontend]
---

# ESLint debt campaign

`npx eslint . --quiet` reports **2,344 errors** (2,483 at first inventory). This
is a repo-wide pre-existing backlog, **not** a per-branch defect — feature
branches "fail their lint gate" for debt that predates them by months.

**The `bug` class is at 0.** Every rule that is wrong at runtime today has been
cleared. What remains is `correctness` (2,234), `doctrine` (106) and `style` (4).

**Read `scripts/lint-debt/FEATURE.md` § "How much of `correctness` is actually
broken today" before planning work here.** The headline is: no live freeze
loop, ~5 confirmed user-visible bugs, and the rest is quality debt. Sizing the
remaining work off the raw 2,234 will send you chasing the wrong things.

## Vision — Arman's words

The governing rulings are the standing ones in `CLAUDE.md`, quoted because each
is a live trap here:

- **"SCREAM, never block."** `pnpm check:lint-debt` always exits 0 and is
  deliberately NOT in `run-release-gates.sh`.
- **"React Compiler is on … Flipping it off means rewriting this rule in the
  same change."** The bulk of these findings ARE its correctness lint.
  **Do not touch `reactCompiler`.**
- **"Never mass-convert `React.lazy` → `next/dynamic`"** — that move added ~190
  chunk groups and OOM-killed 14 production builds (2026-07-27). Relevant
  because the 86 `no-restricted-imports` findings sit on import boundaries.
  Read the `code-splitting` skill rule 3 **before** touching any.
- **No mass `eslint-disable`.** (inferred, from the FOUND_DEFECTS doctrine.)
  Silencing turns a visible backlog into an invisible one. A rule genuinely
  wrong for this codebase gets changed **once** in `eslint.config.mjs`, with a
  comment saying why.

## Resources

- **Scoreboard:** `/administration/reporting/lint-debt` — classified, ranked,
  every row opens its source line, every row/bucket copies a repair brief that
  already carries the bans above.
- **Contract + severity analysis:** [`scripts/lint-debt/FEATURE.md`](../../scripts/lint-debt/FEATURE.md).
- **Commands:** `pnpm check:lint-debt --path=features/x` (seconds — use this to
  verify a fix), `--rule=`, `--class=`, `pnpm check:lint-debt:write` (full pass,
  6–12 min; refreshes the committed snapshot — commit it).
- **Freeze-loop doctrine** (before ANY `set-state-in-effect` fix):
  `features/notes/FEATURE.md` § Freeze-loop doctrine. Invoke the
  `supabase-realtime` skill when the effect touches a `.channel(`.
- **Dev server:** check what is already listening
  (`lsof -nP -iTCP -sTCP:LISTEN | grep node`) and REUSE it. Several sessions run
  concurrently on this box and ports drift (3050/3051/3052 have all been live).
  Never start a second one. Log in at `/login` — `admin@admin.com` / `<see AI_ADMIN_PASSWORD in .env>`.
- **Trap:** do not move or delete files while a scan is running. ESLint
  enumerates the tree up front and reads it after; a file that vanishes in
  between kills the run with a bare `ENOENT`.

## Remaining work

Ordered by value per edit. Re-derive counts from the scoreboard before
starting — the tree moves daily and other sessions add debt.

**1 — the ~5 user-visible `refs` bugs. DONE** (`2da38821bf`) — 2048's undo
history, CodeInlinePreview's last-saved text, `useDesiredValueSlice`'s seed,
ProcessingProgressDialog's "Xs ago" clock and `useAppletRecipeFastAPI`'s
needed-broker list are all state now. The ~20 benign `const x = ref.current`
sites were left alone, as instructed.

**2 — `react-hooks/static-components`. DONE for the whole fixable class**
(`acd5315ec9`, `864de08423`, plus the icon-resolver commit): **129 → 44**, and
every one of the 44 that remain is a false positive of the same shape — see
below. 23 files hoisted, threading the closure values through as props:
JsonEditor/JsonEditorItem `IconButton`, functionDetails `CodeBlock`+`DetailItem`,
DocumentsHubTable `ColumnHead`, RateLimitsClient + search-console DataTable
`SortIcon`, MessageContentDisplay `MarkdownContent`, both AnimatedRevealCards'
`CardContent`, NotificationDropdown `EmptyState`, PodcastsTable `SkeletonRows`,
AssetUploader `VideoStatusIcon`, PodcastEpisodePage's two share buttons,
inline-copy-button `DemoContent` (it held its own `useState`), the four
`Content` components in `components/animated/**`, ThreeColumnBentoGrid's
`Cursor`/`Container`/`CircleWithLine`/`Beam`, BentoGridExampleThree `Container`,
cloud-sync `MsgBanner`. LargeIndicator's `LargeControls` had one call site and
~20 closure values, so it was inlined into that call site instead.

The six "worst product files" this doc used to name
(`ContainerComparisonDetails`, `agent-apps/apps/page.tsx`, `ShortcutDirectory`,
`ShortcutList`, `DeprecatedModelsAudit`, `TasksTableView`) were already at zero
when this batch started — re-derive from the scoreboard, never from this list.

**2b — the 44 that remain are NOT hoistable, and should not be chased.** Every
one is `const Icon = resolveIcon(x)` / `getIconComponent(x)` / `roomIconOf(x)` /
`getViewComponent(id)` / a compiled-component lookup, then `<Icon />`. That is
registry dispatch, not a component defined inside a component: the reference
comes out of a module-level map, so the element type is stable and nothing
remounts unless the icon genuinely changed. There is no hoist that fixes them —
the argument is a runtime value. Concentrated in `resolveIcon` consumers
(scope-system + scopes TemplateGalleryDrawer, OrgScopeTree, ScopeTypeCard,
container-drop), `getMenuIcon` (the three header-right-menu items), `roomIconOf`
(war-room), and the kind/view dispatchers (`ViewRenderer` 4, `ViewWrapper`,
`KindRenderPaths`, `DbKindComponentImpl`, `StudyPackBlock`,
`TemplatePreviewRendererImpl`). **Closing these needs a ruling, not edits:**
either a narrow scoped `eslint.config.mjs` override for the icon-resolver
helpers (one change, with a comment saying why — the doctrine's sanctioned move
for a rule that is wrong for this codebase), or accept them as permanent noise
in the report. Do not sprinkle disables per call site.

**3 — `react-hooks/refs`, the remaining ~586.** ~151 write a ref during render
(unsafe under concurrent rendering; benign today), 3 put a ref in a dependency
array (a dep that can never fire — a lie in the deps). Concentrated:
`DataRefHoverPreview.tsx` (34), `OrgWorkspace.tsx` (33), `CleanupPad.tsx` (27),
`ScrapedResultDetailTabs.tsx` (31), `AgentToolsModal.tsx` (18),
`applet-card/{Default,Enhanced}.tsx` (16 each — near-identical files; fix one,
port it, and ask whether they should be one component).

**4 — `no-restricted-imports` (26 left) + `no-restricted-syntax` (19).**
Architectural bans, never silenced — the import or the shape changes, and the
message names the canonical path. **Read the `code-splitting` skill rule 3
first.**

*Burned down 2026-09-09 from 49 → 26.* The `window-panels/windows/**` group is
at **zero**: `openImageViewer` moved into the openers layer
(`features/overlays/openers/imageViewer.tsx`, alongside the hook), and the four
modules that were never window components at all moved to the features that own
them (`CodeEditorTabBar` + `useCodeEditorWindowState` →
`features/code-editor/multi-file-core/`, `feedbackDraftWrite` →
`features/feedback/`, `site-workbench-bookmarks` → `features/settings/`). The
`window-demo` page now opens the real Notes window through
`useOpenNotesWindow` and reads `selectIsOverlayOpen` for its toggle state.
Four `features/files/**` findings cleared via a three-file scoped override for
the mounts the ban's own config comment NAMES as correct (`app/Providers.tsx`,
`app/DeferredSingletonCore.tsx`, the blob-cache admin page).

**Resolved 2026-09-10:** the `features/files/api/*` ban contradicted its own
comment ("import directly from the owning module") — it was written when `api/`
held HTTP shims, and `api/<module>` are now the owning modules. The group now
bans only the bare `@/features/files/api` directory path (no barrel, invariant
17 intact); the 24 consumers are green. `createSlice` allowlist widened to
`features/**/redux/**` (any depth) and the two chat slices moved into
`features/agents/redux/chat/`. `no-restricted-syntax` is at 0. Items 1–2 above
(user-visible refs bugs, static-components) are in flight; item 3 (~586 refs,
benign today) is the standing backlog.

## Done

- Inventory + CLI — `scripts/lint-debt/` and its `FEATURE.md`.
- Scoreboard — `/administration/reporting/lint-debt` (`features/admin/lint-debt/`).
- Shared source-link door promoted to `features/admin/reporting/source-links.ts`.
- **`bug` class cleared to 0**: `react/jsx-key` (6),
  `@next/next/no-assign-module-variable` (3),
  `@next/next/no-html-link-for-pages` (5), `react-hooks/rules-of-hooks` (132).
  All four rules are gone from the report entirely.
- Severity analysis of the `correctness` bulk — see the FEATURE.md section.
- **The 5 user-visible `refs` bugs** (item 1) and **the whole hoistable
  `static-components` class** (item 2) — 2026-09-10. `static-components`
  129 → 44, all 44 remaining being registry dispatch (item 2b).

## Decisions needed

**Should `check:lint-debt` become a blocking gate once `correctness` is down?**
Right now it is advisory and out of the release gates, which is correct for a
2,344-error backlog. There is no obvious threshold at which it should flip, and
"never blocking" is a standing rule, so this stays advisory until Arman says
otherwise. No action needed unless he wants a different answer.
