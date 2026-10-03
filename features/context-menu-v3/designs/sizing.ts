// features/context-menu-v3/designs/sizing.ts
//
// THE demo's menu size tokens (round 2, 2026-10-02). Every number and its
// source is in SIZING.md next to this file; the package (@ai-matrx/alchemy
// react/menu + react/sheet) can adopt these class strings as they stand.
// Demo-local: nothing in production imports this.

/** Desktop numbers (px). Google Sheets' context menu was measured live; see SIZING.md. */
export const DESKTOP = {
  menuWidth: 360,
  menuPaddingY: 6,
  radius: 8,
  rowHeight: 36,
  rowPaddingX: 10,
  rowGap: 12,
  labelSize: 15,
  shortcutSize: 14,
  headingSize: 12,
  iconSize: 18,
  iconButton: 36,
  iconButtonWidth: 34,
  separatorMargin: 8,
  searchHeight: 36,
} as const;

/** Phone numbers (px): desktop × ~1.33, floored at the 44–48 px touch target. */
export const PHONE = {
  rowHeight: 48,
  rowPaddingX: 14,
  rowGap: 14,
  labelSize: 17,
  shortcutSize: 15,
  headingSize: 13,
  iconSize: 22,
  iconButton: 48,
  separatorMargin: 8,
  searchHeight: 44,
} as const;

/** Tailwind class strings for the numbers above — the shape the package can take over. */
export const D = {
  /** The menu surface (overrides the design-system's w-auto / p-1 / rounded-md). */
  menu: "w-[22.5rem] max-w-[calc(100vw-1rem)] rounded-lg px-1.5 py-1.5",
  submenu: "w-80 max-w-[calc(100vw-1rem)] rounded-lg px-1.5 py-1.5",
  row: "min-h-9 gap-3 rounded-md px-2.5 py-1.5 text-[15px] leading-5",
  glyph: "h-[18px] w-[18px] shrink-0",
  shortcut: "ml-auto pl-4 text-sm tabular-nums text-muted-foreground",
  heading: "px-2.5 pb-1 pt-2 text-xs font-semibold text-muted-foreground",
  separator: "my-2",
  search: "h-9 w-full rounded-md border border-border bg-transparent px-2.5 text-[15px] outline-none focus:border-primary",
  iconButton: "h-9 w-[34px] rounded-md",
  splitChevron: "h-9 w-4 rounded-md",
  strip: "flex flex-wrap items-center gap-0.5 px-1 py-1",
  description: "truncate text-[13px] leading-4 text-muted-foreground",
} as const;

export const P = {
  row: "flex min-h-12 w-full shrink-0 items-center gap-3.5 rounded-lg px-3.5 text-left text-[17px] leading-6 active:bg-accent",
  glyph: "h-[22px] w-[22px] shrink-0",
  shortcut: "ml-auto text-[15px] text-muted-foreground",
  heading: "px-3.5 pb-1 pt-3 text-[13px] font-semibold text-muted-foreground",
  separator: "my-2 h-px shrink-0 bg-border",
  search: "h-11 w-full rounded-lg border border-border bg-transparent px-3.5 text-[17px] outline-none focus:border-primary",
  iconButton: "h-12 w-12 rounded-lg",
  strip: "flex flex-wrap items-center gap-1 px-1 py-1",
  description: "truncate text-sm text-muted-foreground",
} as const;

/**
 * The package's phone sheet (@ai-matrx/alchemy/react/sheet) at the phone numbers above, for the
 * earlier designs, which still draw through it. Scoped by its own data attribute; demo pages only.
 */
export const PACKAGE_SHEET_CSS = `
[data-alchemy-layout="sheet"] [data-alchemy-node] { min-height: ${PHONE.rowHeight}px !important; font-size: ${PHONE.labelSize}px !important; gap: ${PHONE.rowGap}px !important; }
[data-alchemy-layout="sheet"] [data-alchemy-node] svg { width: ${PHONE.iconSize}px !important; height: ${PHONE.iconSize}px !important; }
[data-alchemy-layout="sheet"] [role="toolbar"] [data-alchemy-node] { min-width: ${PHONE.iconButton}px !important; }
`;
