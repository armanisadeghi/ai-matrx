"use client";

/**
 * HOST RE-EXPORT ONLY — `RadixDialogModalProvider` / `useRadixDialogModal` live
 * in `@ai-matrx/design-system`.
 *
 * THIS FILE WAS THE QUIET TWIN. The package has owned this context since 0.5.0,
 * but a host copy survived here, and a duplicated React CONTEXT does not fail
 * loudly: `useContext` matches by object IDENTITY, so the host Drawer's
 * provider and the package Sheet's consumer were two different contexts that
 * merely looked alike — each silently falling back to its default. Re-adding a
 * local `createContext` for this is the defect, not the fix.
 *
 * Import from here or from the package — both are the same context.
 */

export {
  RadixDialogModalProvider,
  useRadixDialogModal,
  type RadixDialogModalProviderProps,
} from "@ai-matrx/design-system";
