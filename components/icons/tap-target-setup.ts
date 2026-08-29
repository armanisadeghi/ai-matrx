/**
 * components/icons/tap-target-setup.ts — HOST WIRING for @ai-matrx/tap-target.
 *
 * Side-effect module: registers `next/link` as the tap-target link component
 * (the package's injectable replacement for the original's hard next/link
 * import). Imported for side effect from BOTH graphs so SSR and hydration
 * render identical link elements:
 *  - `app/Providers.tsx` (server graph — SSR registration)
 *  - `app/DeferredSingletonWrapper.tsx` (client graph — before hydration)
 * The registry lives on a globalThis Symbol.for slot inside the package, so
 * one registration reaches every module-graph copy.
 */
import Link from "next/link";
import {
  setTapTargetLinkComponent,
  type TapTargetLinkComponent,
} from "@ai-matrx/tap-target";

setTapTargetLinkComponent(Link as unknown as TapTargetLinkComponent);
