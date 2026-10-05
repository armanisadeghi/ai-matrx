"use client";

/**
 * A chip host's attachments, as its ONE canvas tab (`context-items`).
 *
 * Every chip host — a sent message's strip, the composer's resources, a
 * conversation's attached documents — opens the same tab kind keyed by its own
 * identity. The tab's data is the host's item list as plain JSON (`items`,
 * the icon dropped and re-resolved from the registry on read) plus the item on
 * screen (`selected`). A chip press shows its item; pressing the chip of the
 * item already in front closes the tab.
 */

import type { CanvasJson } from "@ai-matrx/canvas";
import { useChatCanvasTab } from "../../../host/canvas";
import { CONTEXT_ITEMS_KIND } from "../../../host/canvas-tabs";
import { resolveContextItemDef } from "./registry";
import type { ContextDrawerItem } from "./types";

/** The item minus its icon component, round-tripped through JSON (undefined fields drop). */
export function contextItemsToTabData(items: readonly ContextDrawerItem[]): CanvasJson {
  const plain = items.map(({ icon: _icon, ...rest }) => rest);
  return JSON.parse(JSON.stringify(plain)) as CanvasJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readItem(value: unknown): ContextDrawerItem | null {
  if (!isRecord(value)) return null;
  const { id, blockType, typeLabel, title, themeKey, origin, conversationId, editable, refs } = value;
  if (typeof id !== "string" || typeof blockType !== "string" || typeof title !== "string") return null;
  if (origin !== "resource" && origin !== "block") return null;
  const def = resolveContextItemDef(blockType);
  return {
    id,
    blockType,
    typeLabel: typeof typeLabel === "string" ? typeLabel : def.typeLabel,
    title,
    caption: typeof value.caption === "string" ? value.caption : undefined,
    icon: def.icon,
    themeKey: typeof themeKey === "string" ? themeKey : def.themeKey,
    origin,
    conversationId: typeof conversationId === "string" ? conversationId : "",
    editable: editable === true,
    refs: isRecord(refs) ? (refs as ContextDrawerItem["refs"]) : {},
    raw: value.raw ?? null,
    resourceId: typeof value.resourceId === "string" ? value.resourceId : undefined,
  };
}

/** The tab's items, or [] when its data carries none. */
export function readContextItemsTab(data: CanvasJson | undefined | null): {
  items: ContextDrawerItem[];
  selected: string | null;
} {
  const record = isRecord(data) ? data : {};
  const items = Array.isArray(record.items)
    ? record.items.map(readItem).filter((item): item is ContextDrawerItem => item !== null)
    : [];
  return { items, selected: typeof record.selected === "string" ? record.selected : null };
}

/**
 * A host key for a list that has no identity of its own (a sent message's
 * strip): the conversation plus a hash of the list, so the same attachments
 * always land on the same tab and two different lists never share one.
 */
export function contextItemsListKey(conversationId: string, items: readonly ContextDrawerItem[]): string {
  const text = JSON.stringify(items.map((item) => [item.id, item.blockType, item.title, item.refs]));
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${conversationId}:${hash.toString(36)}`;
}

/**
 * One chip host's tab: `open(items, id)` shows that item (pressing the item
 * already in front closes the tab); `isShowing(id)` is the chip's pressed state.
 */
export function useContextItemsTab(hostKey: string) {
  const tab = useChatCanvasTab({ kind: CONTEXT_ITEMS_KIND, key: hostKey });
  return {
    /** The item id in front (null when the tab is closed or behind). */
    shownId: tab.isVisible ? tab.selected : null,
    isShowing: (id: string) => tab.isVisible && tab.selected === id,
    /**
     * The tab shows a copy of the host's items; when the item in front no
     * longer exists (its chip was removed, an edit reverted, the message sent)
     * the tab closes — it never keeps showing a stale item. Pressing the item
     * already in front is the port's close.
     */
    closeIfGone: (liveIds: readonly string[]) => {
      if (tab.isVisible && tab.selected !== null && !liveIds.includes(tab.selected)) {
        tab.toggle({ title: "", data: {}, selected: tab.selected });
      }
    },
    open: (items: readonly ContextDrawerItem[], id: string) => {
      const item = items.find((candidate) => candidate.id === id) ?? items[0];
      if (!item) return;
      tab.toggle({
        title: item.title,
        data: { items: contextItemsToTabData(items) },
        selected: item.id,
        replaceData: true,
      });
    },
  };
}
