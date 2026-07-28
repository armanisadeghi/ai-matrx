---
status: active
updated: 2026-07-28
verify_surface: /demos/header-demo → select "Structured" variant → header renders IconButtons (back chevron + action pills). Compare computed styles + screenshot before/after each slice.
repos: [matrx-frontend]
---

# Shell CSS → Tailwind (surface reduction)

## Vision — Arman's words

> "we kept the CSS even though we do everything with Tailwind. The bug you just fixed is
> literally one of hundreds because our code base isn't based on CSS, so no one watches it…
> I would really rather just change over and put everything into Tailwind."

> "little bits of CSS here to do things tailwind cannot do is absolutely no problem. We've
> always had that. But in this case, it's that massive parts of our system are driven by CSS,
> and that's what I don't like."

Chosen path (Arman picked from 4 options): **"Safe wins + guardrails."** Delete dead CSS,
port the *pure-styling* classes to Tailwind incrementally with a visual check per slice, **keep
the zero-JS mechanism CSS as CSS**, and let CI watch what remains. Explicitly NOT a full
rewrite — the mechanism (checkbox toggles, `data-pathname` active-nav) is intentional
zero-JS/SSR-first architecture; porting it to Tailwind would only move it by adding React
state + re-renders, which is a downgrade. (inferred from the option he chose, grounded in the
analysis above it.)

## The Bucket A / Bucket B split (the load-bearing distinction)

- **Bucket A — pure styling, PORTABLE to Tailwind:** colors, spacing, borders, static look of
  nav items, the `.icon-btn*` and glass utility classes. ~1,000–1,200 lines of `shell.css`.
- **Bucket B — mechanism, STAYS CSS:** `:checked` checkbox toggles (39), `:has()` (71),
  `data-pathname` active-nav map (124 lines of `:where(...)`), portal-crossing `body:has()`
  (16), `@keyframes` (7), `::view-transition` (8). Tailwind can't express ancestor-state →
  descendant styling as element utilities without becoming `[.shell-root[...]_&]:` arbitrary
  selectors (= the same CSS, in a className string) or moving to JS. Leave it.

Rule of thumb per class: if it styles the element it sits on → Bucket A, port it. If it styles a
descendant based on `.shell-root` state/attribute, or is a pseudo-element/keyframe → Bucket B, leave it.

## Resources

- Target files (line counts as of 2026-07-28): `styles/shell.css` (2,626 ln — **up from 2,450 at the last port slice; the file is growing faster than it is being ported**), `features/shell/components/header/variants/header-variants.css` (717), `app/(core)/notes/notes.css` (565, container-queries — mostly Bucket B).
- **`app/globals.css` STAYS** — it is the Tailwind v4 `@theme`/token/gradient config, not a port target. Bucket A classes port to *element classNames*, referencing globals tokens.
- Shell is CSS-driven & server-rendered: `features/shell/components/AppShell.tsx` (structure), `Sidebar.tsx`, `header/Header.tsx`. `shell.css` is imported globally by AppShell → wraps every authed page (highest blast radius in the repo).
- Guard already in place: `styles/__tests__/shell-grid-invariants.test.ts` (`npx jest styles/__tests__` ). Extend it with a similar static assertion whenever a slice lands.
- Test route: log in at `/login` (`admin@admin.com` / `Password1234#`), then `/chat`. Dev server `next-dev` (port 3001) via preview_start. Reproduce responsive states by resizing the Browser pane + toggling `#shell-sidebar-toggle`.
- Boy-scout: any leftover `window.confirm/alert/prompt` in shell files → replace per CLAUDE.md.

## Remaining work

Port Bucket A leaf-first (lowest blast radius first). **Every slice: screenshot the affected
surface at desktop + mobile, sidebar open + closed, before and after — no slice ships without a
visual diff.** Keep Bucket B untouched.

1. **`.shell-tactile` / `.shell-tactile-subtle`** — hover/active `transform: scale()` helpers.
   Pure styling, BUT used in 23 files as of 2026-07-28 (sidebar controls, header variants, `CodeSidebarMenu`,
   `ChatSidebarMenu`, `AgentRunSidebarMenu`, demos). Higher blast radius than `.icon-btn*` was —
   port the CSS to a shared Tailwind cluster + swap every consumer in one pass, or leave it as a
   thin utility. Verify a hover/press still scales on a sidebar row and a header action.
2. **Static nav-item styling** — the non-state parts of `.shell-nav-item` / `.shell-nav-icon` /
   `.shell-nav-label` (padding, radius, colors, transitions). Leave the `:has(:checked)` and
   `data-pathname` active-state rules (Bucket B) in CSS.
3. **Auth island + header static bits** in `header-variants.css` — port the pure-visual pieces;
   leave any variant selectors keyed off shell state.
4. After each area empties, delete its CSS block and add a one-line static guard mirroring the
   grid-invariant test so CI keeps watching the shrinking file.

Do NOT attempt: converting the sidebar/mobile-menu toggles, the `data-pathname` active-nav map,
view transitions, or keyframes. Those are Bucket B by design.

**Dead-code finding (re-confirmed 2026-07-28 — grep for `notes-toolbar` across `.tsx` returns
nothing; the only hits are `notes.css` itself):** `.notes-toolbar` (`container-name: notes-toolbar`,
`app/(core)/notes/notes.css:49`) is applied in ZERO components repo-wide, so its whole
`@container notes-toolbar` block — including the `.notes-toolbar-*` children — is inert. Delete it,
separately from the port.

## Done

- Grid-squeeze bug (mobile + persisted sidebar-open pinned `main` to 208px) fixed — `styles/shell.css` §13.
- Dead `app/shell-original-a6b46613c.css` (2,076 ln, zero refs) deleted.
- CI guard for the grid-cascade invariant added — `styles/__tests__/shell-grid-invariants.test.ts`.
- Bucket A slice 1: IconButton `.icon-btn*` geometry ported to Tailwind in the component — see `features/shell/components/IconButton.tsx` (before/after computed styles + screenshot verified identical).
