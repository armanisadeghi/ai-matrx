---
status: active
updated: 2026-08-11
repos: [matrx-frontend]
---

# ESLint debt campaign

`npx eslint . --quiet` reports **2,483 errors**. This is a repo-wide pre-existing
backlog, **not** a per-branch defect — feature branches "fail their lint gate"
for debt that predates them by months. The inventory and scoreboard are built;
what remains is the fixing, worst-first.

## Vision — Arman's words

Not a vision-doc feature; the governing rulings are the standing ones in
`CLAUDE.md`, quoted because every one of them is a live trap here:

- **"SCREAM, never block."** No check may block a build or a commit.
  `pnpm check:lint-debt` always exits 0 and is deliberately NOT in
  `run-release-gates.sh`.
- **"React Compiler is on … Flipping it off means rewriting this rule in the
  same change."** The bulk of these findings ARE the compiler's correctness
  lint. Turning it off is not a fix. **Do not touch `reactCompiler`.**
- **"Never mass-convert `React.lazy` → `next/dynamic`"** — that exact move added
  ~190 chunk groups and OOM-killed 14 straight production builds (2026-07-27).
  Relevant because the 82 `no-restricted-imports` findings sit on import
  boundaries. Read the `code-splitting` skill rule 3 **before** touching any.
- **No mass `eslint-disable`.** (inferred from the FOUND_DEFECTS doctrine —
  "track what you can't fix", loudly.) Silencing converts a visible backlog into
  an invisible one, which is strictly worse. A rule that is genuinely wrong for
  this codebase gets argued and changed **once** in `eslint.config.mjs`, with a
  comment saying why.

## Resources

- **Scoreboard:** `/administration/reporting/lint-debt` — classified, ranked,
  every row opens its source line, every row/bucket copies a paste-ready repair
  brief that already carries the bans above.
- **Contract + classification:** [`scripts/lint-debt/FEATURE.md`](../../scripts/lint-debt/FEATURE.md).
- **Commands:** `pnpm check:lint-debt --path=features/x` (seconds — use this to
  verify a fix), `pnpm check:lint-debt --rule=react/jsx-key`,
  `pnpm check:lint-debt --class=bug`, `pnpm check:lint-debt:write` (full pass,
  ~6 min; refreshes the committed snapshot — commit it).
- **Freeze-loop doctrine** (read before ANY `set-state-in-effect` fix):
  `features/notes/FEATURE.md` § Freeze-loop doctrine. Also invoke the
  `supabase-realtime` skill when the effect touches a `.channel(` subscription —
  the two classes overlap and this one froze whole browsers ~10 times.
- **Verify a surface:** `preview_start` name `next-dev` (port 3001, reuse a
  running server), log in at `/login` with `admin@admin.com` / `Password1234#`.
- **Trap:** do not move or delete files while a scan runs. ESLint enumerates the
  tree up front and reads it after; a file that vanishes in between kills the
  run with a bare `ENOENT`.

## Remaining work

Ordered by priority. Counts are the 2026-08-11 baseline — re-derive from the
scoreboard before starting, the tree moves daily.

**1 — `react-hooks/rules-of-hooks` (132, class `bug`).** Conditional hooks are
real crashes the moment a branch flips. 43 files, extremely top-heavy:

| Findings | File |
|---|---|
| 23 | `components/mardown-display/blocks/links/LinkComponent.tsx` |
| 17 | `app/(admin)/administration/ui/official-components/component-displays/content-editor.tsx` |
| 8 | `components/official/HelpIcon.tsx` |
| 8 | `features/agent-apps/components/AutoCreateAgentAppForm.tsx` |
| 7 | `app/(admin)/…/component-displays/floating-sheet.tsx` |
| 6 | `features/public-chat/components/GuidedVariableInputs.tsx` |

The remaining 37 files are 1–4 each; ~20 of them are
`app/(admin)/administration/ui/official-components/component-displays/*` demo
files sharing ONE shape (a `useState` after an early return) — sweep them as a
single batch. The fix is always: hoist every hook above the condition, branch on
the result; pass a `disabled` flag into a hook rather than skipping the call. If
the component is really two components, split it.

**2 — `react-hooks/refs` (594, class `correctness`).** Refs read/written during
render; tears under concurrent rendering and under compiler memoization. Highly
concentrated — the top 7 files are 169 of them:

`features/agents/components/previews/DataRefHoverPreview.tsx` (34),
`features/organizations/components/OrgWorkspace.tsx` (33),
`features/transcription-cleanup/components/CleanupPad.tsx` (27),
`features/scraper/parts/ScrapedResultDetailTabs.tsx` (31),
`features/agents/components/tools-management/AgentToolsModal.tsx` (18),
`features/applet/home/applet-card/{Default,Enhanced}.tsx` (16 each).

Note the two applet-card files are near-identical — fix one, port it, and check
whether they should be one component at all.

**3 — `react-hooks/set-state-in-effect` (1,105, class `correctness`).** The
cascading-render class behind the repeated browser freezes. **This is the one to
be slow and careful on**, and the one where a bad "fix" is worse than the
finding. Preferred fixes in order: derive during render instead of storing;
move the write into the event handler that caused it; key the component to reset
state. Start with files that also carry a realtime subscription or an autosave
loop — that intersection is where the freezes actually came from.

**4 — `react-hooks/static-components` (209, class `correctness`).** A component
defined inside another is a new type every render: the subtree unmounts and
remounts, losing state, focus and scroll. Mechanical fix (hoist to module scope,
pass props) and heavily concentrated —
`components/animated/demos/bento-grids/ThreeColumnBentoGrid.tsx` (25),
`components/debug/PromptExecutionDebugPanel.tsx` (14).

**5 — `no-restricted-imports` (82) + `no-restricted-syntax` (15), class
`doctrine`.** These are architectural bans, never silenced — the import or the
shape changes, and the message names the canonical path. **Read the
`code-splitting` skill rule 3 first** (see Vision).

**6 — the long tail** (`immutability` 122, `purity` 98, `error-boundaries` 42,
`preserve-manual-memoization` 38, `use-memo` 25, `globals` 1). Lowest value per
edit; leave until the classes above are down.

**Not worth doing:** the 4 `style` findings (`react/display-name` ×2,
`react/jsx-no-comment-textnodes` ×2). Listed for completeness only.

**Keep the snapshot honest.** After any batch: `pnpm check:lint-debt:write` and
commit `report.json` + `history.json`. The scoreboard shows the scan's age and
screams past 7 days; a stale snapshot means stale line numbers on every link.

## Done

- Inventory + CLI built — see `scripts/lint-debt/` and its `FEATURE.md`.
- Scoreboard shipped at `/administration/reporting/lint-debt` — see
  `features/admin/lint-debt/`.
- Shared source-link door promoted to `features/admin/reporting/source-links.ts`
  so the dead-ends and lint-debt consoles share one copy.
- `react/jsx-key` (6), `@next/next/no-assign-module-variable` (3),
  `@next/next/no-html-link-for-pages` (5) — all cleared.
