/**
 * THE DIRECTIVE-HOST SLOT — a leaf the content-ir host reads and `directiveHost` fills.
 *
 * WHY A SLOT, NOT AN IMPORT (G13, 2026-10-07). `ContentIrHostBoundary` used to import
 * `matrxDirectiveHost` statically. That host's door graph (DirectiveConsequence →
 * useReferenceDoor → item-presentation → google-workspace → components/official →
 * KindInstanceRender) reaches the content-ir host again — a 13-module static cycle, and on a
 * fresh note load "Cannot access 'matrxDirectiveHost' before initialization". The edge that
 * pointed back up is inverted here: this module imports nothing at runtime, the directive host
 * calls `provideDirectiveHost` at its own evaluation, and the content host reads it at use.
 *
 * WHO FILLS IT: `features/matrx-envelope/directiveHost.tsx`, evaluated by every module that
 * imports it — including `providers/richContentHost.ts`, the app's rich-content host, which the
 * engine's entry points suspend on before any kind renders.
 *
 * Guard: `pnpm check:host-cycles` (no static cycle through content-ir/host or matrx-envelope).
 */
import type { DirectiveHost } from "@ai-matrx/content-ir-react";

let provided: DirectiveHost | undefined;
let warnedEmpty = false;

/** Called once, by `directiveHost.tsx`, when its module finishes evaluating. */
export function provideDirectiveHost(host: DirectiveHost): void {
  provided = host;
}

/**
 * The registered directive host, or undefined before `directiveHost.tsx` has evaluated. An empty
 * read SCREAMS once (console.error): the package then draws directive cards apply-less and
 * copy-less, which is honest chrome but means the app's host never loaded `directiveHost`.
 */
export function providedDirectiveHost(): DirectiveHost | undefined {
  if (!provided && !warnedEmpty) {
    warnedEmpty = true;
    console.error(
      "[content-ir] The directive host was read before features/matrx-envelope/directiveHost.tsx evaluated — " +
        "directive cards render without Apply / open / copy until it loads. Import it where this surface boots.",
    );
  }
  return provided;
}
