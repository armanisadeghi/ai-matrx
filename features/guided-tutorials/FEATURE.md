# FEATURE.md — Guided tutorials

**Status:** `active` (built 2026-10-04; end-to-end browser walk not yet completed — see Open items)
**Tier:** `2`
**Working label:** "guided tutorial" — Arman's word ("little user tutorials"). The vocabulary
(`common-docs/systems/platform/vocabulary/FEATURE.md`) has no term for this yet; do not rename.

## Purpose

A platform primitive for walking ONE person through a page: an admin sends a tutorial by in-app
DM (a card with **Show me how**) and/or email; the link opens the route and a spotlight dims the
page, cuts out one element at a time with an animated ring, and waits for the person to do the
thing. Finishing is remembered per person.

## How it works

| Piece | File |
|---|---|
| Definitions (typed registry) | `registry.ts` — `GUIDED_TUTORIALS`, `findTutorial`, `tutorialHref` |
| Global runner (reads `?tutorial=<id>`) | `TutorialHost.tsx`, mounted in `app/DeferredSingletonCore.tsx` |
| Spotlight + step card | `TutorialSpotlight.tsx` (portal to `document.body`) |
| DM card (`guided_tutorial` action kind) | `TutorialMessageCard.tsx`, registered in `features/messaging/actions/messageActionSurfaces.tsx`; payload type `GuidedTutorialActionPayload` in `features/messaging/types.ts` |
| Admin send | `admin/SendTutorialDialog.tsx` + `admin/sendTutorial.ts`; door: Users & Access → Accounts → row menu → **Send a tutorial…** |
| Completion | `userPreferences.system.completedTutorials` (synced preferences, same pattern as `viewedAnnouncements`) |
| Guard | `__tests__/registry.test.ts` |

**Why a code registry, not a table.** Every step targets a `data-tour="…"` attribute that only
exists once code puts it on the page, so a tutorial and its targets must ship together. Admins
still send any registered tutorial without code. If admins later need to author tutorials, a table
can replace `GUIDED_TUTORIALS` behind `findTutorial` without touching the runner or the card.

**Sending reuses existing doors only.** DM: `sendDirectActionMessage` (the `@ai-matrx/messaging`
framework-free path) with action `{ kind: "guided_tutorial", version: 1, payload: { tutorial_id,
title, href } }`. Email: `sendAdminEmail` → `/api/admin/email` (super-admin, Resend). Each channel
reports its own outcome; a failed email never hides a sent DM.

## Spotlight rules

- **Non-blocking.** Every overlay layer is `pointer-events: none`; only the step card takes input.
  The page (and AI) stay usable — no-dead-ends rule 0.
- Cutout = a transparent box whose `0 0 0 200vmax` shadow is the dim layer; position/size animate
  between steps. Ring pulse while waiting; a ripple when the action lands.
- Step advances on the person's action: `click` = any press inside the target; `copy` = a press on
  a button inside the target or a `copy` event. Next/Back/Skip, progress dots, Escape skips,
  Alt+Arrow moves.
- Target missing after 4 s → the card says so ("This part isn't on the page right now"); never
  points at nothing.
- Finish: glow + 28-piece confetti from semantic chart/primary tokens; `prefers-reduced-motion`
  removes every animation and transition (static ring instead).
- Finishing records the id; skipping records nothing. The `?tutorial=` key is removed on close.

## Adding a tutorial

1. Put `data-tour="<feature>-<step>"` on each target element (literal string — the guard greps it).
2. Add an entry to `GUIDED_TUTORIALS` (all text ≤60 chars).
3. `pnpm jest features/guided-tutorials` — fails if any target is missing from source.

## Seeded

`connect-your-ai` on `/bring-your-work`: Pick your AI (`byw-pick-ai`, click) → Get your key
(`byw-get-key`) → Connect (`byw-connect`, copy) → Pick what to move (`byw-move-work`, copy).

## Open items

- End-to-end browser walk (admin send → DM as test@test.com → tour to the end) not completed:
  the shared preview's concurrent-walk cap kept parking the session (2026-10-04).
- Email delivery unverified (no send was made to the third-party test.com mailbox).
- The four `data-tour` attributes live in `BringYourWorkPage.tsx`, which another session was
  redesigning uncommitted; they land with that session's commit.

## Change log

- `2026-10-04` — claude: built the primitive, admin send, DM card, seeded `connect-your-ai`.
