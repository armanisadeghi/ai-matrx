/**
 * Global navigation primitive — Cmd/Ctrl/middle/modified clicks must open a
 * new tab, never replace the current one (data-loss hazard).
 *
 * Prefer a real `<Link href>` / `<a href>` so the browser handles this natively.
 * Use this helper only when an onClick intercepts navigation (loading states,
 * router.push, opening a window/modal instead of following the href).
 *
 * @see .cursor/rules/navigation-feedback.mdc
 */

export type NewTabClickEvent = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
};

/** True when the browser should keep native "open in new tab" behaviour. */
export function shouldOpenInNewTab(e: NewTabClickEvent): boolean {
  return Boolean(
    e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1,
  );
}

/**
 * For `<Link href>` wrappers that intercept plain clicks (e.g. loading UX via
 * router.push). Returns true when the caller should bail and let the href win.
 *
 * ```tsx
 * <Link href={path} onClick={(e) => {
 *   if (allowNativeNewTab(e)) return;
 *   e.preventDefault();
 *   router.push(path);
 * }}>
 * ```
 */
export function allowNativeNewTab(e: NewTabClickEvent): boolean {
  return shouldOpenInNewTab(e);
}

/**
 * When there is no underlying `<a href>` (CommandItem, SelectItem, etc.), open
 * the URL in a new tab yourself. Call this from onClick BEFORE onSelect runs.
 */
export function openInNewTab(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}
