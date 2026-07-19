---
status: active
updated: 2026-07-14
repos: [matrx-frontend]
vision: [.claude/skills/core-route-headers/SKILL.md, features/shell/components/header/variants/USAGE.md]
---

# Header conformance — (core) routes onto the shell header system

## Vision — Arman's words

> "ABSOLUTELY NO BORDERS or color differences on the header. Must be transparent with glass buttons."
> "NOTICE THERE IS NO STUPID TITLE and DESCRIPTION! …you don't put that inside of a dashboard."
> "On mobile we should always prefer as few things in the header as possible and just putting everything into a bottom drawer."
> "Notice how absolutely random the page widths are… on desktop we need to use the space." (widths = separate sweep, item 3)

## Resources

- Recipe: `.claude/skills/core-route-headers/SKILL.md`. Spec: `features/shell/components/header/variants/USAGE.md`.
- Templates: `features/shell/components/header/templates/EntityModeHeader.tsx` (+ `CrumbTrailHeader.tsx`); reference consumer `features/scheduling/components/detail/ScheduleDetail.tsx`.
- Detection: `pnpm check:page-headers`; `grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" "app/(core)" --include="*.tsx"`. Both are at ZERO real hits in (core) as of 2026-07-14 (only education files + one comment match) — keep them at zero.
- Verify: session dev server + `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/<route>`; both 1280 and 375.

## Remaining work (from the wave-2 browser-verify pass — each was seen live)

1. **/messages/[conversationId] crashes on load** — reproducible runtime error adding `presence` callbacks (realtime). Messaging is mid-refactor (`features/messaging/components/shell/`); whoever owns that refactor fixes it — invoke the `supabase-realtime` skill.
2. **Mobile-broken body layouts** (header rows are fine; bodies don't adapt at 375): `/lists/v1|v2|v3` fixed two-column editors; `/code` IDE workspace (no stacked/drawer fallback); `/agent-connections` two-pane shell; `/data/[id]` table toolbar overlap; `/agents/shortcuts/all` table overflow. Each is a mobile-first pass per `.claude/skills/ios-mobile-first/SKILL.md`, not a header fix.
3. **Page-width normalization** — the "1998 widths" sweep (e.g. `max-w-3xl` crammed forms on desktop). Needs Arman's target rules before fleeting.
4. **/legal/ca-wc/pd-ratings-calculator mobile**: 5 header items, no bottom-sheet collapse — port to `EntityModeHeader` actions.
5. **/images + /images/studio in-body hero blocks** (big title + description in a dashboard) — decide keep-as-landing vs strip; likely strip per doctrine.
6. Small verified-live defects logged by agents, unrelated to headers, worth triage into the task system (`/task-hygiene`): /artifacts card stuck in isNavigating spinner; /files table row click side-effect creates a real share link; /voice/playground Cartesia voice-list ParseError; /transcripts/scribe nested-button console errors; app-wide "state update before mount" console error (seen on /scraper + home).
7. **Education route files** (`app/(core)/education/**` heights) — owned by the active education session; do not touch from this campaign.

## Done

- Skill + spec + templates + `TapTargetButtonDestructive`; `RouteModeNav` measurement fix; shell.css inject display bug (`5523ac373`).
- Wave 1: 35 families fixed (`baa9dd59d`). Wave 2: residuals + CMS template dedup + ALL families browser-verified at both viewports, fixes applied inline (`b510ea043`, `0edc52815`). Faux headers and banned heights in (core): **zero**.
- False alarm cleared: EntityModeHeader mobile drawer reported broken by one verify agent — re-tested directly, works.
