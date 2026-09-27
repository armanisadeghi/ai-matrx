/**
 * True while a Radix popper that HOLDS the pointer or the Escape key is open —
 * a menu, a popover (role="dialog") or a listbox. Tooltips are poppers too but
 * hold nothing, so they never count (a hovered button's tooltip must not keep
 * the nav overlay open or swallow the full-screen Escape).
 */
export function aMenuOrPopoverIsOpen(): boolean {
  return (
    document.querySelector(
      '[data-radix-popper-content-wrapper] :is([role="menu"],[role="dialog"],[role="listbox"])',
    ) !== null
  );
}
