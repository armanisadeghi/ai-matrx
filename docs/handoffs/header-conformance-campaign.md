---
status: active
updated: 2026-07-14
repos: [matrx-frontend]
vision: [.claude/skills/core-route-headers/SKILL.md, features/shell/components/header/variants/USAGE.md]
---

# Header conformance — (core) routes onto the shell header system

## Vision — Arman's words

> "The entire point of this system and this UI is lost… If we're going to shit away the header that the app has given us, then the app will just use it itself to do what it needs. I worked tirelessly for months to eliminate everything from the header to give that space to the pages."

> "ABSOLUTELY NO BORDERS or color differences on the header. Must be transparent with glass buttons."

> "NOTICE THERE IS NO STUPID TITLE and DESCRIPTION! AI Agents love putting that garbage but you don't put that inside of a dashboard."

> "The best mobile experience is when you don't try to cram things… on mobile we should always prefer as few things in the header as possible and just putting everything into a bottom drawer."

> "Figure out how to make the organization scope header page wrapper into a template, and then figure out how to take what agents have to make that into a wrapper and just simplify it." — done: the two templates below. Every remaining fix should CONSUME them, not hand-roll.

> "Notice how absolutely random the page widths are… schedules/id ≈768px… on desktop we need to use the space." (separate follow-up, not header work)

Buttons: glass tap targets only (match the app), primary action = solid primary pill with its name, delete = solid destructive pill with its name (white text — `TapTargetButtonDestructive`), icon-only actions always tooltip. See `/demos/button-demo`.

## Resources

- **Skill (read first, it is the whole recipe):** `.claude/skills/core-route-headers/SKILL.md` — failure classes, gold standards, fix recipes, gotchas, browser-verify protocol.
- **Templates (consume, don't hand-roll):**
  - `features/shell/components/header/templates/EntityModeHeader.tsx` — agents pattern for any `[id]` route. Reference consumer: `/schedules/[id]` (`features/scheduling/components/detail/ScheduleDetail.tsx`).
  - `features/shell/components/header/templates/CrumbTrailHeader.tsx` — org/scopes breadcrumb pattern for drill-downs.
  - Primitives: `RouteHeader`, `RouteModeNav`, `PageHeader` (same dir); tap buttons `components/icons/tap-buttons.tsx` + `TapTargetButton(Destructive|Solid|Group)`.
- **Spec:** `features/shell/components/header/variants/USAGE.md`.
- **Detection:** `pnpm check:page-headers` (markers KNOWN NARROW — add new faux combos to `scripts/check-page-headers.ts`); `grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" "app/(core)" --include="*.tsx"`.
- **Verify:** session dev server + `http://localhost:<port>/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/<route>`; or `/login` `admin@admin.com` / `Password1234#`. Screenshot desktop 1280 AND mobile 375 — a flaw in your own screenshot is a failure.
- Exceptions that must NOT be "fixed": `/administration/*`, `(transitional)`, `(legacy)` sit BELOW the header by design.

## Remaining work

1. **Browser-verify pass over the fleet wave.** 35 route families were fixed by agents (commit `baa9dd59d`) while the dev server was down, so **none were visually verified**. Walk each family per the skill's verify protocol, both viewports; fix what the eye catches. Highest-value first: `/notes`, `/files`, `/transcripts`, `/projects`, `/data`, `/organizations/**`, `/artifacts`, `/code`.
2. **Residual faux headers (4):** `app/(core)/agents/categories/page.tsx`, `app/(core)/agents/shortcuts/edit/[id]/page.tsx`, `app/(core)/organizations/[orgId]/shortcuts/page.tsx` + `.../shortcuts/categories/page.tsx`. Use `EntityModeHeader`/`RouteHeader`.
3. **Residual banned heights (12 files, list via the grep above):** tasks (layout + new), chat/new, agents/new/import, agents/shortcuts/edit, podcast/studio (run-e, create-e), education ×5 (education is another active session's territory — coordinate before touching).
4. **Agents family sub-pages** were deliberately excluded from the fleet (gold-standard family) but `categories`, `shortcuts/**`, `new/import` don't conform — fix with the templates.
5. **Migrate the two bespoke implementations onto the templates when touched:** `features/cms/components/CmsSiteSwitcher.tsx` + `CmsHubHeader.tsx` (→ `EntityModeHeader` internals), `features/scope-system/components/ScopeBreadcrumb.tsx` (→ `CrumbTrailHeader` core). Behavior identical; this is dedup only.
6. **agent-connections mobile:** the two-pane resizable shell has no narrow-viewport fallback (stacked/drawer) — flagged by the fleet, out of header scope, needs a decision-free mobile-first pass.
7. **Page-width normalization** (Arman: "back in 1998") — separate sweep; do NOT bundle into header fixes beyond trivial `max-w-3xl → max-w-5xl` bumps where already editing.
8. In-flight in separate sessions (don't duplicate): avatar collision in `FeatureAdminPage` shared header; messaging build/refactor (`features/messaging/components/shell/`).

## Done

- Skill authored + hardened — `.claude/skills/core-route-headers/SKILL.md`.
- Templates built + browser-proven both viewports — `features/shell/components/header/templates/`.
- `TapTargetButtonDestructive` reusable + labeled primary/destructive header pills — `components/icons/TapTargetButton.tsx`.
- `RouteModeNav` w-full measurement trap fixed — `features/shell/components/header/RouteModeNav.tsx`.
- Reference fixes: CMS family, schedules family (incl. `[id]` view/edit on `EntityModeHeader`), /suggestions, /agents/all mobile, agent build mobile header re-enabled.
- Fleet wave over 35 (core) families — commit `baa9dd59d`; faux headers 59→4 marker hits, banned heights 59→12 files.
