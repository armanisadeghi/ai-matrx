# Coming Soon — a promise we made, tracked like a defect

**A "Coming Soon" is a promise to a user, not a placeholder.** We deliberately advertise actions we intend to build, so users can see where the product is going and engineers feel the debt. That policy only works if every promise is **declared, countable, and reviewed** — otherwise "coming soon" becomes a graveyard of things nobody remembers agreeing to.

So: same handling as a found defect. **Report it, and ask to solve it.**

## The rule for agents

1. **Never render a bare "coming soon" string, toast, or stub modal.** Register the entry in `registry.ts`, then call `announceComingSoon(id)`. An unregistered id throws in development — an untracked promise is the failure this system exists to prevent.
2. **Adding an advertised-but-unbuilt action is encouraged**, not discouraged. Listing the full intended surface is the point.
3. **When you touch a feature that owns a Coming Soon entry, surface it.** Same reflex as `FOUND_DEFECTS.md`: name it in your summary and offer to build it. Do not silently leave it.
4. **`stage: "blocked"` requires `blockedBy`.** A blocked promise with no named blocker is an untracked defect wearing a nicer hat.
5. **Delete the entry in the same change that ships the feature.** A registry that still promises something already built is worse than no registry.

## Files

| File | Role |
|---|---|
| `types.ts` | `ComingSoonEntry` — id, label, owner feature, the user-facing promise, stage, blocker, surfaces |
| `registry.ts` | THE list. `COMING_SOON`, `getComingSoon`, `listComingSoon(owner?)` |
| `announce.ts` | `announceComingSoon(id)` — the one way to tell a user |

`announceComingSoon` rides the existing global confirm host with a single OK button (`cancelLabel: null`). No new overlay, no new singleton, no new dialog component.

## Stages

- `planned` — intended, nothing built.
- `building` — actively in progress right now.
- `blocked` — built but gated (deploy pending, flag off, backend not live). Needs `blockedBy`.

## Reading the backlog

`listComingSoon()` is the whole backlog; `listComingSoon("agents")` is one feature's. It is plain code, so it greps, counts, and diffs in review. An admin surface that renders it grouped by owner is an obvious next step and is not built yet.

## Change log

- **2026-08-19** — Removed the fulfilled `connectors.notion` promise when the chat connector strip was wired to the live per-user MCP OAuth path.
- **2026-08-13** — First P9 patrol batch registered nine previously untracked chat, Image Studio, and Education promises and routed their existing action handlers through `announceComingSoon`.
- **2026-07-25** — Created alongside `/agents/browse`, seeded with the six agent-record promises (three inherited from `/agents/all`'s dead-end icons, three new).

## A registered promise is now a fact the SERVER can read

**Cross-repo SoR: `/Users/armanisadeghi/code/common-docs/systems/platform/route-liveness/STATE.md` — read it before touching this registry's route-facing half.**

🚨 **THIS REGISTRY STOPPED BEING A FRONTEND-ONLY CONCERN ON 2026-08-29.** An HR text message
reached the owner's phone with a link to `/hr/me/schedule` — a route whose page mounts
`MePillarSurface` and renders the registered promise `hr.me.schedule`. The frontend knew
perfectly well that surface was a placeholder. The Python notification spine had no way to
ask. Measured that day: **32 of the 42 SMS-default HR notification events declare a deep
link to a placeholder or to a route that does not exist.**

So the classification is now generated and published:

- `lib/route-manifest/generate.ts` walks `app/**/page.tsx` and marks a route `placeholder`
  when it mounts one of the shells named in `PLACEHOLDER_SHELLS`, carrying its `promiseKey`.
- `lib/route-manifest/manifest.generated.json` is the checked-in lockfile
  (`pnpm route-manifest:generate`), guarded by `pnpm check:route-manifest --strict`.
- `pnpm route-manifest:sync` pushes it to `platform.route_manifest`, which the server reads
  before it puts a link in a message.

**What this means for you.** Adding a whole-page placeholder is now a change the server
sees — no extra step, the walk finds it. But **a NEW placeholder shell must be added to
`PLACEHOLDER_SHELLS` in the same commit that introduces it**: a shell the walk does not
recognize makes its routes look LIVE, and a route that looks live is how a dead link
reaches a phone. `check-route-manifest` fails on any page handing a `promiseKey` to an
unnamed shell, which is the one way that could slip through. And when a lane ships a real
surface, deleting the coming-soon entry and mounting the real page is what re-enables every
notification the placeholder was suppressing — nothing else needs editing.
