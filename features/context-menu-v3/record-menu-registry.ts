/**
 * A RECORD'S ROWS, IN THE ONE MENU OF THE CONTENT THAT SHOWS IT (R26; ALC-15 round 5).
 *
 * A record's toolbar can live apart from the content it belongs to: on /notes the tab strip holds the
 * note's ⋯ (Save, Duplicate, Move, Delete, Close tab…) while the note's content is drawn in the pane
 * below. The ⋯ and a right-click on that content target the SAME thing — the note — so they must be
 * one menu (measured 2026-09-27: 27 rows from the tab's ⋯, 25 from the content, each missing the
 * other's rows).
 *
 *   · The owner of the rows registers them under a key: `registerRecordMenu(key, get)`.
 *   · The host marks the content's root with `data-record-menu="<key>"`.
 *   · Every menu opened inside that root carries the registered sections (and the record's entity,
 *     when the menu has none of its own) — the shell reads them at open (ContextMenuV3).
 *   · The record's ⋯ calls `openRecordMenu(key, button)`: it opens the content's OWN menu at the
 *     button. `false` = that content is not on screen; the caller opens its own menu instead.
 *
 * Plain data, no React.
 */
import type { ContextMenuEntityRef, ContextMenuExtraSection } from "./types";

export const RECORD_MENU_ATTR = "data-record-menu";

export interface RecordMenuRows {
  entity?: ContextMenuEntityRef | null;
  extraSections: ContextMenuExtraSection[];
  /**
   * The record's own name for the menu header ("Note · Clinic intake
   * checklist") — used when the clicked content names nothing itself, so the
   * header names the record instead of quoting its body. A selection still wins.
   */
  heading?: { label: string; text: string } | null;
}

const registry = new Map<string, () => RecordMenuRows>();

/** Register the rows a record contributes; returns the unregister. Read at every open, so always current. */
export function registerRecordMenu(key: string, get: () => RecordMenuRows): () => void {
  registry.set(key, get);
  return () => {
    if (registry.get(key) === get) registry.delete(key);
  };
}

/** The rows of the record whose content holds `target` (nearest marked root), or null. */
export function resolveRecordMenu(target: Element | null): RecordMenuRows | null {
  const key = target?.closest?.(`[${RECORD_MENU_ATTR}]`)?.getAttribute(RECORD_MENU_ATTR);
  if (!key) return null;
  return registry.get(key)?.() ?? null;
}

const TRIGGER = '[data-alchemy-trigger="context"]';

/**
 * The right-click trigger a click on the record's content lands in: the first menu trigger inside
 * the marked root that carries content (`data-content-source`), else the root's own trigger.
 */
function contentTrigger(root: HTMLElement): HTMLElement | null {
  const inner = root.querySelector<HTMLElement>(`${TRIGGER}[data-content-source]`);
  if (inner) return inner;
  if (root.matches(TRIGGER)) return root;
  return root.querySelector<HTMLElement>(TRIGGER) ?? root.closest<HTMLElement>(TRIGGER);
}

/**
 * Open the record content's own menu at `anchor` (a ⋯ button). Returns false when no content for
 * `key` is on screen, so the caller can open its own menu instead.
 */
export function openRecordMenu(key: string, anchor: HTMLElement): boolean {
  const doc = anchor.ownerDocument;
  const root = [...doc.querySelectorAll<HTMLElement>(`[${RECORD_MENU_ATTR}]`)].find(
    (el) => el.getAttribute(RECORD_MENU_ATTR) === key,
  );
  const trigger = root ? contentTrigger(root) : null;
  if (!trigger) return false;
  const rect = anchor.getBoundingClientRect();
  trigger.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: doc.defaultView ?? window,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom,
    }),
  );
  return true;
}
