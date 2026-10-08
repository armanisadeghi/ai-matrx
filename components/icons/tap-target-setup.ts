/**
 * components/icons/tap-target-setup.ts — HOST WIRING for @ai-matrx/design-system/tap-target.
 *
 * Side-effect module: registers `next/link` as the tap-target link component
 * and, in development builds, turns on the package's misuse guard
 * (the package's injectable replacement for the original's hard next/link
 * import). Imported for side effect from `app/DeferredSingletonWrapper.tsx`
 * — a CLIENT module, which executes during the SSR pass of client components
 * too, so SSR and hydration both render through next/link. It must NOT be
 * imported from a Server Component: the package entry is "use client", so
 * its exports are client references there and calling the setter throws.
 * The registry lives on a globalThis Symbol.for slot inside the package, so
 * one registration reaches every module-graph copy.
 */
import Link from "next/link";
import {
  enableTapTargetGuard,
  setTapTargetLinkComponent,
  type TapTargetLinkComponent,
} from "@ai-matrx/design-system/tap-target";
import { enablePillGuard } from "@ai-matrx/design-system";

setTapTargetLinkComponent(Link as unknown as TapTargetLinkComponent);

// THE MISUSE GUARD, development builds only: a tap button that a caller bends
// (a parent gap, a padded wrapper, a token override, a non-colour className,
// no tooltip text) renders as a giant red box naming the fault. Gated HERE,
// in host code Next compiles, never inside the package (whose build inlines
// NODE_ENV).
if (process.env.NODE_ENV !== "production") {
  enableTapTargetGuard();
  // A capsule wider than 320px or wrapping to two lines gets a dashed red
  // outline + one [pill-guard] console error (owner, 2026-10-04).
  if (typeof window !== "undefined") enablePillGuard();
}
