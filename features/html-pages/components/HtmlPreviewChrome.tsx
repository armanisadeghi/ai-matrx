"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Lets the block that HOLDS an inline html page (the chat `<artifact>` block)
 * hand its title, its extra actions and its canvas opener to the page
 * preview, so the page carries ONE header instead of the block's label row
 * stacked on the preview's own title bar.
 */
export interface HtmlPreviewChrome {
  /** Used when the page has no <title>. */
  title?: string;
  /** Extra header actions (version history, detach) — on the row when the card has room. */
  actions?: ReactNode;
  /** The same actions as "More" menu entries, for a card too narrow for the row (a phone). */
  menuItems?: readonly HtmlPreviewChromeMenuItem[];
  /** Always rendered at the end of the row — e.g. the anchor a menu entry's popover opens from. */
  menuAnchors?: ReactNode;
  /** The holder's canvas opener (same `html` canvas path, keeps its tab identity). */
  openInCanvas?: () => void;
  /** True while this block's canvas tab is in front. */
  canvasOpen?: boolean;
}

export interface HtmlPreviewChromeMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

const HtmlPreviewChromeContext = createContext<HtmlPreviewChrome | null>(null);

export const HtmlPreviewChromeProvider = HtmlPreviewChromeContext.Provider;

export function useHtmlPreviewChrome(): HtmlPreviewChrome | null {
  return useContext(HtmlPreviewChromeContext);
}
