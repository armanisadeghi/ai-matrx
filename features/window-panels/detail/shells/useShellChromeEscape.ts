// features/window-panels/detail/shells/useShellChromeEscape.ts
//
// 🚨 NEW-22 (VERIFY-U-P1-R4, residue closed in R5) — ESCAPE CLOSES THE DETAIL
// FROM THE SHELL'S OWN CHROME TOO.
//
// The keyboard model `@ai-matrx/detail` specifies is "Escape → close", read on the
// presentation's own root and on every slot it fills (`data-detail-root`,
// `data-detail-keyboard-slot`). The SHELL's chrome is none of those: `WindowPanel`'s
// close / minimize / pop-out buttons, `SidePanelSurface`'s close button and drag
// handle, and the page's route header render outside the slots, in a PORTAL, and
// neither component handles a keystroke. So with focus on the window's own close
// button — a place a person's focus lands constantly — Escape did nothing, while
// `DetailDockedShell`'s header comment told the next agent the docked panel closes
// on Escape (VERIFY-U-P1-R5, NEW-22: "the shell's OWN chrome"). Code and comment
// now agree, in all three shells, on the behaviour the package specifies.
//
// WHY A DOCUMENT LISTENER AND NOT A WRAPPER: both surfaces portal out of the
// shell's React subtree (`MatrxDynamicPanelHost` and `WindowPanel` both
// `createPortal`), so a wrapping element cannot see the chrome's events at all.
//
// WHY IT DOES NOT DOUBLE-HANDLE: it is a BUBBLE-phase listener and the
// presentation's own handler runs in CAPTURE at the detail root, where it calls
// `preventDefault()` + `stopPropagation()` — so a keystroke the model already
// answered never reaches here, and a keystroke the model deliberately DECLINED (a
// text field with uncommitted edits, an open menu or select) is left alone by the
// same guards below. What is left is exactly the chrome, and a keystroke with
// nothing focused, which is the overlay convention everywhere else.

"use client";

import { useEffect } from "react";

/** The slots the primitive's own capture handler already owns. */
const DETAIL_OWNED = "[data-detail-root], [data-detail-keyboard-slot]";

/**
 * Escape belongs to the focused control, not to the detail: something OPEN over
 * it, or a text field holding edits the person has not committed. The same two
 * cases the primitive's keyboard model names, and only those two.
 */
const CONTROL_OWNS_ESCAPE =
  '[data-radix-popper-content-wrapper], [role="menu"], [role="menubar"], ' +
  '[role="listbox"], [role="tree"], [role="grid"]';

function escapeBelongsToTheControl(target: HTMLElement): boolean {
  if (target.tagName === "SELECT") return true;
  if (target.getAttribute("aria-expanded") === "true") return true;
  if (target.closest(CONTROL_OWNS_ESCAPE)) return true;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return target.value !== target.defaultValue;
  if (target instanceof HTMLInputElement) return target.value !== target.defaultValue;
  return false;
}

export function useShellChromeEscape(onClose: (() => void) | null | undefined): void {
  useEffect(() => {
    if (!onClose) return undefined;
    const answer = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // The primitive already answered (or deliberately did not) for its own slots.
      if (target.closest(DETAIL_OWNED)) return;
      if (escapeBelongsToTheControl(target)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", answer);
    return () => document.removeEventListener("keydown", answer);
  }, [onClose]);
}
