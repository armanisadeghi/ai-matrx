"use client";

/**
 * HOST RE-EXPORT ONLY — the Accordion family lives in
 * `@ai-matrx/design-system` (0.8.0, census row 19c). This file exists so the
 * ~14 `@/components/ui/accordion` import sites (and the two DB-authored
 * component scopes that map this specifier) stay put.
 *
 * The fork this replaced drew `p-4` triggers — the package's DEFAULT density
 * (`size="md"`) — so there is nothing to bind here. Pass `size="sm"` on any
 * individual `<Accordion>` that wants the dense rung; never re-fork the file.
 *
 * Three things the fork got wrong and the package does not:
 *   - The chevron rotation selector was `[&[data-state=open]>svg]`, but the
 *     chevron was nested a div deep, so it never matched the chevron — and DID
 *     match any icon a call site passed as a direct child of the trigger. The
 *     package targets the chevron's own slot.
 *   - The trigger had no `focus-visible` ring: keyboard focus was invisible.
 *   - The open/close transition was `animate-accordion-down/-up`, Tailwind
 *     utility names defined only in this app's `globals.css`. The package owns
 *     the keyframes in its `styles.css` (`.matrx-accordion-content`, keyed off
 *     `--radix-accordion-content-height`, honouring `prefers-reduced-motion`),
 *     so the host keyframes were deleted with the fork.
 *
 * The one visible change: `md` content is `px-4 pb-4`, so a panel's body now
 * lines up with its `p-4` header instead of sitting 16px to its left.
 */

export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  type AccordionProps,
  type AccordionSize,
  type AccordionTriggerProps,
  useAccordionSize,
} from "@ai-matrx/design-system";
