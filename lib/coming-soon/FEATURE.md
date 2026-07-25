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

- **2026-07-25** — Created alongside `/agents/browse`, seeded with the six agent-record promises (three inherited from `/agents/all`'s dead-end icons, three new).
