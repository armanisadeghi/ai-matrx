"use client";

/**
 * HOST RE-EXPORT ONLY — the Resizable family lives in
 * `@ai-matrx/design-system`, on react-resizable-panels v4.
 *
 * THIS FILE AND `components/ui/matrx/resizable.tsx` WERE THE SAME COMPONENT
 * TWICE, disagreeing about exactly one thing: how thick the handle is. That is
 * the density-as-a-fork pattern the package exists to end, so thickness is now
 * `size="xs".."4xl"` and both files are re-exports. This one's historical 2px
 * line is the package DEFAULT (`size="xs"`), so every call site here is
 * unchanged.
 *
 * The v4 knowledge and the drag-outline fix (the library sets `tabIndex=0`, so
 * a MOUSE drag focuses the separator and the browser's default outline flashed
 * near-white in dark mode — `focus-visible:` is keyboard-only and does not
 * suppress it) live in the package's own header. Two additions there: the
 * cursor is orientation-aware (`row-resize` on a horizontal separator, which
 * this copy always got wrong), and the grab target widens to 44px on touch.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizableHandleProps,
  type ResizableHandleSize,
} from "@ai-matrx/design-system";
