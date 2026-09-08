"use client";

/**
 * HOST RE-EXPORT ONLY — this context lives in `@ai-matrx/design-system`.
 *
 * IT MUST BE ONE CONTEXT, NOT TWO. `components/ui/dialog.tsx` is now the
 * package's Dialog, so `DialogContentPrimitive` reads the PACKAGE's modality
 * context. A host copy of this provider would silently stop reaching it — the
 * provider would wrap, the primitive would read its own default, and the
 * `aria-modal` a non-modal dialog is supposed to drop would come back. Two
 * React contexts with the same name and different identities fail exactly that
 * quietly, which is why this file forwards instead of declaring.
 *
 * Consumers: `components/ui/drawer.tsx` and `components/ui/matrx/dialog.tsx`,
 * both of which wrap package-owned content.
 */

export {
  RadixDialogModalProvider,
  useRadixDialogModal,
} from "@ai-matrx/design-system";
export type { RadixDialogModalProviderProps } from "@ai-matrx/design-system";
