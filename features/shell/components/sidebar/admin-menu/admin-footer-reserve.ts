// admin-footer-reserve — the sidebar footer never grows when admin status resolves.
//
// `isAdmin` arrives after first paint (auth boot), so the admin block used to mount into a
// footer that SSR drew 34px tall, growing it to ~197px and shifting it (layout shift on every
// load, 2026-10-08). The last measured footer height is kept in localStorage; an inline script
// before the footer publishes it as `--shell-admin-footer-h` ahead of first paint, and
// styles/shell.css gives the footer that min-height (content bottom-aligned), so the admin
// block fills space that was already there. A person who turns out not to be an admin drops the
// hint; the next load draws no gap.

export const ADMIN_FOOTER_STORAGE_KEY = "matrx:admin-footer-h";
export const ADMIN_FOOTER_ATTR = "data-admin-footer";
export const ADMIN_FOOTER_VAR = "--shell-admin-footer-h";

/** Runs before the footer paints; must never throw. */
export const ADMIN_FOOTER_PREPAINT_SCRIPT = `(function(){try{var h=parseInt(window.localStorage.getItem(${JSON.stringify(ADMIN_FOOTER_STORAGE_KEY)}),10);if(h>0&&h<600){var d=document.documentElement;d.setAttribute(${JSON.stringify(ADMIN_FOOTER_ATTR)},"");d.style.setProperty(${JSON.stringify(ADMIN_FOOTER_VAR)},h+"px");}}catch(_){}})();`;

/** Remember (height > 0) or forget (null) the footer's settled height. */
export function rememberAdminFooterHeight(height: number | null): void {
  try {
    if (height === null || height <= 0) window.localStorage.removeItem(ADMIN_FOOTER_STORAGE_KEY);
    else window.localStorage.setItem(ADMIN_FOOTER_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // Storage blocked: the footer simply grows on load, as it did before.
  }
}
