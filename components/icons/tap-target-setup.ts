/**
 * components/icons/tap-target-setup.ts — HOST WIRING for @ai-matrx/tap-target.
 *
 * Side-effect module: registers `next/link` as the tap-target link component
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
  setTapTargetLinkComponent,
  type TapTargetLinkComponent,
} from "@ai-matrx/tap-target";

setTapTargetLinkComponent(Link as unknown as TapTargetLinkComponent);
