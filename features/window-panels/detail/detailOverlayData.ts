// features/window-panels/detail/detailOverlayData.ts
//
// The overlay-slice shape of a Detail instance, and its parser. The openers
// write it flat (Redux data must be plain); the controller reads it back by
// name; the page route builds it from its params. ONE spelling, here.

import { trimListContext } from "@/lib/detail/listContext";
import {
  DEFAULT_DETAIL_LIST_CONTEXT_MAX,
  type DetailInstanceData,
  type DetailListContext,
  type DetailRef,
} from "@/lib/detail/types";

export interface DetailOverlayData {
  type: string;
  id: string;
  seedName: string | null;
  seedAbout: string | null;
  listItems: DetailRef[] | null;
  listIndex: number | null;
}

function isDetailRef(value: unknown): value is DetailRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/** Narrow the untyped overlay payload; `null` when it does not name a record. */
export function readDetailOverlayData(
  data: Record<string, unknown> | null | undefined,
): DetailOverlayData | null {
  if (!data || typeof data.type !== "string" || typeof data.id !== "string") return null;
  const listItems = Array.isArray(data.listItems) ? data.listItems.filter(isDetailRef) : null;
  return {
    type: data.type,
    id: data.id,
    seedName: typeof data.seedName === "string" ? data.seedName : null,
    seedAbout: typeof data.seedAbout === "string" ? data.seedAbout : null,
    listItems: listItems && listItems.length > 0 ? listItems : null,
    listIndex: typeof data.listIndex === "number" ? data.listIndex : null,
  };
}

export function toDetailInstanceData(data: DetailOverlayData): DetailInstanceData {
  const list: DetailListContext | null =
    data.listItems && data.listIndex !== null
      ? { items: data.listItems, index: data.listIndex }
      : null;
  const seed =
    data.seedName || data.seedAbout ? { name: data.seedName, about: data.seedAbout } : null;
  return { type: data.type, id: data.id, seed, list };
}

// ─── Page-route encoding of the list context ────────────────────────────────
// `/detail/<type>/<id>?l=type.id,type.id&i=<index>&lt=<total>` — the same
// `type.id` instance key the `?panels=detail:` deep link uses. `lt` is present
// only when the list was TRIMMED to fit the URL (NEW-7): it is the length of the
// list the window was cut from, so the detail can say so.

/**
 * 🚨 NEW-7 — CAPPED, ALWAYS. `max` is the resolved
 * `ui.detail.list_context_max_ids` knob; the default is used when the host has
 * no answer yet, never "no cap". A 500-row list uncapped produced a >20 KB href
 * no server accepts (VERIFY-U-P1-R2).
 */
export function encodeListQuery(
  list: DetailListContext | null | undefined,
  max: number = DEFAULT_DETAIL_LIST_CONTEXT_MAX,
): string {
  const capped = trimListContext(list, max);
  if (!capped) return "";
  // Each `type.id` is encoded, the separators are not: a comma is legal in a
  // query value, and `%2C` × 200 was 400 bytes of nothing.
  const l = capped.items.map((r) => `${encodeURIComponent(r.type)}.${encodeURIComponent(r.id)}`).join(",");
  const trimmed = capped.trimmedFrom ? `&lt=${capped.trimmedFrom}` : "";
  return `?l=${l}&i=${capped.index}${trimmed}`;
}

export function decodeListQuery(
  l: string | null | undefined,
  i: string | null | undefined,
  /** `lt` — the length of the list this window was cut from, when it was. */
  lt?: string | null | undefined,
): DetailListContext | null {
  if (!l) return null;
  const items: DetailRef[] = [];
  for (const key of l.split(",")) {
    const dot = key.indexOf(".");
    if (dot <= 0 || dot === key.length - 1) continue;
    items.push({ type: key.slice(0, dot), id: key.slice(dot + 1) });
  }
  if (items.length === 0) return null;
  const index = Number.parseInt(i ?? "", 10);
  const total = Number.parseInt(lt ?? "", 10);
  return {
    items,
    index: Number.isFinite(index) && index >= 0 && index < items.length ? index : 0,
    ...(Number.isFinite(total) && total > items.length ? { trimmedFrom: total } : {}),
  };
}
