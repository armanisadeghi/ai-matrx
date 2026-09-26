// The ONE class for a table's action row (Window, Data, Chart this, Save,
// Workbook, Google Sheet, Export, Edit…), shared by both table renderers.
//
// It is a compact ICON toolbar, one line under the table: every button shows
// its icon only (its label stays its accessible name and becomes its tooltip
// via `useTableActionTitles`), borderless, 28px tall. Nine labelled outline
// buttons wrapped to two lines at chat width and five on a phone once "Chart
// this" joined them (ui-change-inventory row 9, 2026-09-26). It still wraps
// and never grows past its column, so no button can be pushed off the left
// edge (verify-RC-B9 F6). Buttons marked `data-keep-label` (Save / Cancel
// while editing a table) keep their words.

import { useEffect, useRef } from "react";

const ICON_ONLY =
  "[&_button:not([data-keep-label])]:h-7 [&_button:not([data-keep-label])]:min-w-7 [&_button:not([data-keep-label])]:gap-0.5 [&_button:not([data-keep-label])]:px-1.5 [&_button:not([data-keep-label])]:text-[0px] [&_button:not([data-keep-label])]:border-transparent [&_button:not([data-keep-label])]:bg-transparent [&_button:not([data-keep-label])]:shadow-none [&_button:not([data-keep-label])]:text-muted-foreground [&_button:not([data-keep-label]):hover]:bg-accent [&_button:not([data-keep-label]):hover]:text-foreground [&_button[aria-pressed=true]]:text-primary";

export function tableActionRowClass(isMobile: boolean): string {
  return isMobile
    ? `mt-1 flex min-w-0 max-w-full flex-wrap items-center justify-start gap-0.5 ${ICON_ONLY}`
    : `mt-1 flex min-w-0 max-w-full flex-wrap items-center justify-end gap-0.5 ${ICON_ONLY}`;
}

/**
 * Gives every icon-only button in the row a tooltip from its own name
 * (aria-label, else its label text), and keeps it current as labels flip
 * ("Data" ↔ "Table", "Chart this" ↔ "Hide chart"). A title set by the button
 * itself is never overwritten.
 */
export function useTableActionTitles<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const apply = () => {
      row.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.title && button.dataset.autoTitle === undefined) return;
        const name = (button.getAttribute("aria-label") || button.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (name && button.title !== name) {
          button.title = name;
          button.dataset.autoTitle = "";
        }
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(row, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return ref;
}
