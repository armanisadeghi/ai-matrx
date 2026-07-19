---
name: efficient-tap-button-migration
description: Migrates legacy custom buttons (raw <button>, IconButton, className-styled <Bug/>/<Plus/> etc.) to the project's TapButton system using the production-ready efficiency pattern — pre-composed tap buttons with proper spacing (no padding/margin/gap overrides anywhere), heavy decoration split via next/dynamic with cheap selector gating, types imported from canonical owners (never duplicated, never re-declared), and canonical overlay-action calls (openOverlay({ overlayId })) instead of typed convenience wrappers. Use when replacing any custom icon button with a TapButton; when migrating header/toolbar/footer icons; when adding lazy-loaded "feature highlight" decorations to a button; or when the user mentions tap targets, tap buttons, BugTapButton, PlusTapButton, "efficiency update", "efficiency refactor", "lazy split", or asks to make a small UI component production-ready.
---

# Efficient TapButton Migration Pattern

The single source of truth for migrating any small icon button to the project's tap-target system. Reference implementation: `features/feedback/FeedbackButton.tsx` + `features/feedback/FeedbackHighlight.tsx`. Read both before applying this skill to a new component.

The pattern has four pillars. All four must hold for the migration to be considered complete.

---

## Pillar 1 — Tap-target hygiene

### Rules

- **No surrounding spacing.** Never wrap a TapButton in `p-*`, `m-*`, or `gap-*`. The invisible 44×44 outer ring already reserves space; adding more produces double-spacing.
- **No `className` for visuals.** Variation goes through documented props: `variant`, `tooltip`, `ariaLabel`, `bgColor`, `iconColor`, `hoverBgColor`, `activeBgColor`. A `className` passthrough on a TapButton consumer is a code smell.
- **Pre-composed > primitive.** Use `BugTapButton`, `PlusTapButton`, `SearchTapButton`, etc. from `components/icons/tap-buttons.tsx`. Don't reach for the raw `TapTargetButton` + manual icon.
- **Tooltip auto-derives from `ariaLabel`.** Set `ariaLabel="Submit Feedback"` and the tooltip mirrors. Pass `tooltip="..."` only to override. Pass `tooltip={false}` to opt out.
- **Anchor decorations to the visible 32×32 inner pill.** Badges/dots/pings use `top-1.5 right-1.5` (offset 6px from the 44×44 outer), not `top-0 right-0`.

### Mapping consumer `className` → `variant`

| Old className intent | New variant |
|---|---|
| `shell-glass …` background | `variant="glass"` (default — omit) |
| `hover:bg-accent` / hover-only background | `variant="transparent"` |
| Solid filled button (e.g. primary CTA) | `variant="solid"` + `bgColor="bg-…"` |
| Inside a `TapTargetButtonGroup` | `variant="group"` |

### Migration before/after

```tsx
// ❌ Before — custom <button>, className overrides, p-2 padding
<button
  className="p-2 rounded-full hover:bg-accent transition-colors"
  aria-label="Submit Feedback"
  onClick={handleClick}
>
  <Bug className="w-4 h-4" />
</button>

// ✅ After — pre-composed TapButton, no className, props only
<BugTapButton
  variant="transparent"
  ariaLabel="Submit Feedback"
  onClick={handleClick}
/>
```

### Suspense fallbacks must match the 44×44 outer

A TapButton's outer ring is 44×44 (`h-11 w-11`). If a parent lazy-loads the button via `Suspense`, its fallback must reserve the same dimensions or the row will shift on hydration.

```tsx
// ❌ Before — sized to the old custom button (~32×32)
<Suspense fallback={<button className="p-2 opacity-30" disabled><Bug className="w-4 h-4" /></button>}>
  <FeedbackButton />
</Suspense>

// ✅ After — sized to the 44×44 tap target
<Suspense
  fallback={
    <span className="flex h-11 w-11 items-center justify-center opacity-30" aria-hidden="true">
      <Bug className="w-4 h-4" />
    </span>
  }
>
  <FeedbackButton />
</Suspense>
```

---

## Pillar 2 — Lazy-bundle discipline

The default for a small button used across many routes: **only the icon and click-dispatch ship in main.** Heavy decoration (extra icons, animation classes, dismiss UI, persistence logic, redux actions used only by the decoration) goes in a sibling component loaded via `next/dynamic`.

### Rules

- **Split when the lazy chunk is meaningfully heavier than the main chunk.** A 2-line decoration with no extra deps shouldn't be split — the network round-trip and chunk bookkeeping cost more than they save. Split when the lazy code pulls extra `lucide-react` icons, animation logic, persistence calls, or substantial JSX.
- **Use `next/dynamic({ ssr: false, loading: () => null })`.** No SSR (interactive-only), no fallback flicker.
- **Always include `"use client"` on the lazy file.** Required even though it's only imported via `next/dynamic` from a client file.
- **Gate the dynamic render with cheap selectors.** Wrap `<Lazy />` in a redux/state boolean check so the chunk isn't fetched for users who'll never see it. The gate uses cheap selectors that already live in main; only the decoration's *side effects* (timers, dispatches) move to the lazy file.
- **Coordinate parent ↔ lazy child via a one-shot `tick: number` prop.** When the parent click should trigger something in the lazy child (e.g. dismiss the highlight), pass `dismissTick: number` and increment on click; the lazy child watches it via `useEffect`. No callback refs, no event bus, no imperative handles, no context.
- **Co-locate redux actions with the chunk that dispatches them.** Actions used by the always-rendered icon (e.g. `openOverlay`) stay in main. Actions used only by the decoration (e.g. `setModulePreferences`) live in the lazy file.

### File layout

```
features/<feature>/
├── <Feature>Button.tsx        # main chunk: icon + click + gate + dynamic ref
└── <Feature>Highlight.tsx     # lazy chunk: decoration + persistence + extra icons
```

### Reference: main file

```tsx
// features/feedback/FeedbackButton.tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import {
  BugTapButton,
  type TapButtonProps,
} from "@/components/icons/tap-buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

const FeedbackHighlight = dynamic(() => import("./FeedbackHighlight"), {
  ssr: false,
  loading: () => null,
});

type FeedbackButtonProps = Pick<TapButtonProps, "variant" | "tooltip">;

export default function FeedbackButton({
  variant = "glass",
  tooltip,
}: FeedbackButtonProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((s) => s.userAuth.id);
  const viewCount = useAppSelector(
    (s) => s.userPreferences.system.feedbackFeatureViewCount,
  );
  const prefsLoaded = useAppSelector(
    (s) => s.userPreferences._meta.loadedPreferences !== null,
  );
  const [dismissTick, setDismissTick] = useState(0);

  const shouldShowHighlight = !!userId && prefsLoaded && viewCount < 5;

  const handleClick = useCallback(() => {
    if (shouldShowHighlight) setDismissTick((n) => n + 1);
    dispatch(openOverlay({ overlayId: "feedbackDialog" }));
  }, [dispatch, shouldShowHighlight]);

  return (
    <div className="relative">
      <BugTapButton
        variant={variant}
        ariaLabel="Submit Feedback"
        tooltip={tooltip}
        onClick={handleClick}
      />
      {shouldShowHighlight && <FeedbackHighlight dismissTick={dismissTick} />}
    </div>
  );
}
```

The lazy file (`FeedbackHighlight.tsx`) is a regular client component — see the reference file for the full structure.

---

## Pillar 3 — Type ownership

A type is defined **once**, by its OWNER, and imported everywhere else. This is non-negotiable.

### Rules

- **Never duplicate a type that already exists.** Even if it's a 4-member union you "happen to know."
- **If the owner doesn't export the type, export it from the owner.** Don't fork a private copy. Add the `export` keyword to the owner's file in the same change.
- **Use `Pick<OwnerType, ...>` to derive narrow subsets** when a wrapper forwards a few of many props.
- **Use `OwnerType["fieldName"]` to extract a single field's type** when you don't need a separate alias.

### Forbidden

```tsx
// ❌ BAD — local fake type duplicating the owner's union
type TapVariant = "glass" | "transparent" | "solid" | "group";

interface MyButtonProps {
  variant?: TapVariant;
  tooltip?: string | false;
}
```

### Correct

```tsx
// ✅ GOOD — derived from the canonical source
import type { TapButtonProps } from "@/components/icons/tap-buttons";

type MyButtonProps = Pick<TapButtonProps, "variant" | "tooltip">;
```

If the owner doesn't yet export the type, add the `export` to the owner file in the same change. Example:

```tsx
// components/icons/tap-buttons.tsx — owner
export interface TapButtonProps {
  variant?: Variant;
  // ...
}
```

---

## Pillar 4 — Canonical overlay-action calls

The overlay slice exposes both:
- A canonical reducer: `openOverlay({ overlayId, instanceId?, data? })`
- Typed convenience wrappers: `openFeedbackDialog()`, `openShareModal({...})`, etc.

The convenience wrappers that just hardcode an `overlayId` are an extra indirection — callers must remember the typed wrapper exists. The canonical reducer requires only the `overlayId` string, which is already the canonical identifier from the window registry.

### Rules

- **Default to `dispatch(openOverlay({ overlayId: "..." }))` for new code and migrations.** The string IS the canonical identifier; the wrapper just hides it.
- **Use a typed wrapper only when it accepts non-trivial options** that benefit from a type-checked signature (e.g. `openShareModal({ resourceType, resourceId, resourceName, isOwner })`). For wrappers that just hardcode the overlayId with no other params, prefer the canonical call.
- **Never invent new typed wrappers** for overlays that take zero or trivial params. They add an import, a layer of indirection, and a maintenance burden.

### Before / after

```tsx
// ❌ Before — extra indirection, callers must remember the wrapper
import { openFeedbackDialog } from "@/lib/redux/slices/overlaySlice";
dispatch(openFeedbackDialog());

// ✅ After — canonical, says exactly what it does
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
dispatch(openOverlay({ overlayId: "feedbackDialog" }));
```

### When to keep the typed wrapper

```tsx
// ✅ Keep — non-trivial options, type safety adds real value
import { openShareModal } from "@/lib/redux/slices/overlaySlice";
dispatch(openShareModal({
  resourceType: "agent",
  resourceId: agentId,
  resourceName: agent.name,
  isOwner: true,
}));
```

---

## Migration checklist

Copy this checklist when applying the pattern to a new button. Tick each item before declaring the migration complete:

```
- [ ] 1. Identify the canonical TapButton owner type (TapButtonProps from components/icons/tap-buttons.tsx)
- [ ] 2. Replace the legacy <button> / <IconButton> / className-styled element with a pre-composed TapButton (BugTapButton, PlusTapButton, etc.)
- [ ] 3. Drop ALL className props on the TapButton itself. Use variant= instead.
- [ ] 4. Set ariaLabel; let tooltip auto-derive (or pass explicitly).
- [ ] 5. Resize any matching Suspense fallbacks to flex h-11 w-11.
- [ ] 6. Anchor any badges/dots/pings to top-1.5 right-1.5 (visible inner pill).
- [ ] 7. Identify heavy decoration (extra lucide icons, animations, persistence logic, dedicated useEffects) and move it to a sibling file.
- [ ] 8. Wrap the lazy file in next/dynamic({ ssr: false, loading: () => null }).
- [ ] 9. Add "use client" to the lazy file.
- [ ] 10. Gate the lazy render with cheap redux/state selectors so the chunk doesn't fetch for users who won't see it.
- [ ] 11. Coordinate parent → lazy child via a tick: number prop, never callbacks/refs/context.
- [ ] 12. Move redux actions used only by the decoration into the lazy file.
- [ ] 13. Replace any local type aliases with Pick<OwnerType, ...> or OwnerType["field"] imports. If the owner doesn't export the type, export it from the owner in the same change.
- [ ] 14. Replace dispatch(openSomethingDialog()) typed wrappers with dispatch(openOverlay({ overlayId: "..." })) — unless the wrapper carries non-trivial typed options.
- [ ] 15. Audit ALL consumers (grep for the component name) and update each call site in the same change. Update Suspense fallbacks in those consumers too.
```

---

## Reference implementation

Read these before applying the pattern to a new component:

- `features/feedback/FeedbackButton.tsx` — main chunk: icon + dispatch + gate + dynamic ref + `Pick<>`-derived type + canonical `openOverlay` call.
- `features/feedback/FeedbackHighlight.tsx` — lazy chunk: `PartyPopper` + `X` icons, dismiss button, view-count auto-increment timer, `setModulePreferences` dispatch.
- `components/icons/tap-buttons.tsx` — owner of `TapButtonProps`. Pre-composed buttons (`BugTapButton`, `PlusTapButton`, etc.) and the `Wrap` variant resolver.
- `components/icons/TapTargetButton.tsx` — primitive (`TapTargetButton`, `TapTargetButtonTransparent`, `TapTargetButtonSolid`, `TapTargetButtonForGroup`, `TapTargetButtonGroup`). Don't import directly unless a pre-composed version doesn't exist; add a new pre-composed export instead.
- `components/icons/README.md` — definitive doc on the spacing rule and the `Wrap` helper for adding new pre-composed buttons.
- `app/(dev)/demos/button-demo/page.tsx` — live demo of every variant, group, and AI brand button.
- `lib/redux/slices/overlaySlice.ts` — `openOverlay` (canonical reducer) and the typed convenience wrappers.

The migration of `FeedbackButton`'s consumers (`components/layout/new-layout/DesktopLayout.tsx`, `features/public-chat/components/ChatMobileHeader.tsx`, `components/matrx/PublicHeaderFeedback.tsx`) is the canonical example of consumer-side rules in action — read those diffs to see how `className=...` becomes `variant=...` and how Suspense fallbacks are resized.

---

## Anti-patterns

- ❌ Wrapping a TapButton in a `<div className="p-2">` to add space.
- ❌ Passing `className="hover:bg-accent rounded-full transition-colors"` to a TapButton "for theming."
- ❌ Importing `TapTargetButton` directly when a `BugTapButton` / `PlusTapButton` already exists.
- ❌ Re-declaring `type TapVariant = "glass" | "transparent" | ...` instead of importing `TapButtonProps` from the owner.
- ❌ Splitting a 2-line decoration into a lazy chunk just because lazy is "good practice."
- ❌ Forgetting `"use client"` on the lazy file.
- ❌ Using a callback ref, custom event, or context for parent ↔ lazy-child coordination.
- ❌ Calling `dispatch(openFeedbackDialog())` in new code when `openOverlay({ overlayId: "feedbackDialog" })` says the same thing more directly.
- ❌ Inventing a new typed wrapper for an overlay that takes zero or trivial params.
- ❌ Leaving Suspense fallbacks at the old button's dimensions after the underlying button grows to 44×44.
- ❌ Updating only the focused file's call site and forgetting the other consumers.
- ❌ Forking a private type from the owner instead of `export`-ing it from the owner.
