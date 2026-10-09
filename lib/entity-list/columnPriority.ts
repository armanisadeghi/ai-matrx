// lib/entity-list/columnPriority.ts
//
// THE LEAST IMPORTANT COLUMN LEAVES FIRST (DATA-HOME-3E, 2026-10-01). At 1024 px /data's seven
// columns added up past the list's width: the table scrolled sideways inside itself, Owner and
// Access sat off the right edge, and a floating `>` chevron covered Updated. Linear's list drops
// its lowest-priority properties as the window narrows and brings them back when it widens; this
// is that rule for every entity list.
//
// A column declares `priority` (EntityColumnSpec): 1 = keep longest, higher = leaves sooner. A
// column with no priority (the name, the star, anything a surface did not rank) never leaves. When
// the shown columns' declared widths, plus the row-actions column, exceed the room the list has,
// the highest-priority-number column leaves first (the later-declared one on a tie), until the rest
// fit. It is layout, not a preference: nothing is stored, and the column picker says so for each
// column that has no room ("No room").

import type { EntityColumnSpec } from "./columns";

/** Width counted for a column whose declared width is not a number of pixels. */
export const UNKNOWN_COLUMN_WIDTH = 120;
/** Room the table's own row-actions column takes (copy + ⋮ at desktop density). */
export const ROW_ACTIONS_WIDTH = 80;

function widthOf<TRow>(spec: EntityColumnSpec<TRow>): number {
  const w = spec.column.width;
  return typeof w === "number" && Number.isFinite(w) ? w : UNKNOWN_COLUMN_WIDTH;
}

/** One column as the rule sees it: id, width in px, priority (null = never leaves), locked. */
export interface RoomItem {
  id: string;
  w: number;
  p: number | null;
  l: boolean;
}

/**
 * THE RULE, as one self-contained function (no imports, no outer names) so the same source runs on
 * the server's HTML before React hydrates (`noRoomScript`) and in React. Ids that leave, least
 * important first; `available` null = none leave.
 */
export function roomRule(items: RoomItem[], available: number | null, reserve: number): string[] {
  if (available === null || available <= 0) return [];
  let total = reserve;
  for (let i = 0; i < items.length; i++) total += items[i].w;
  if (total <= available) return [];
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter((c) => typeof c.item.p === "number" && !c.item.l)
    .sort((a, b) => (b.item.p as number) - (a.item.p as number) || b.index - a.index);
  const out: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (total <= available) break;
    out.push(candidates[i].item.id);
    total -= candidates[i].item.w;
  }
  return out;
}

/**
 * The ids of the shown columns that have no room at `available` px, least important first.
 * `available` null (not measured yet, or a phone, where the list is cards) = none leave.
 */
export function columnsWithoutRoom<TRow>(
  specs: readonly EntityColumnSpec<TRow>[],
  hidden: readonly string[],
  available: number | null,
  reserve: number = ROW_ACTIONS_WIDTH,
): string[] {
  const items: RoomItem[] = specs
    .filter((spec) => !hidden.includes(spec.id))
    .map((spec) => ({
      id: spec.id,
      w: widthOf(spec),
      p: typeof spec.priority === "number" ? spec.priority : null,
      l: Boolean(spec.locked),
    }));
  return roomRule(items, available, reserve);
}

/**
 * Attribute the pre-hydration script puts on `<html>` (never on the table: React hydrates the
 * table and logs a mismatch for any attribute it did not render). Its value is the space-separated
 * 1-based column positions that have no room; `<html>` carries `suppressHydrationWarning`.
 */
export const NO_ROOM_ATTR = "data-matrx-no-room-pre";
const NO_ROOM_MAX_COLUMNS = 40;
/** CSS that makes the marked column positions take no room; ship once, next to the table. */
export const NO_ROOM_CSS = Array.from(
  { length: NO_ROOM_MAX_COLUMNS },
  (_, i) =>
    `html[${NO_ROOM_ATTR}~="${i + 1}"] table:has(>thead th[data-matrx-table-column-id]) :is(th,td):nth-child(${i + 1}){display:none!important}`,
).join("");

/**
 * FIRST PAINT = SETTLED PAINT. The server paints every column; React only learns the list's width
 * after hydration (a second or more in dev) and then drops the columns with no room — the table
 * visibly jumped (CLS 0.09 on /data). Linear and Notion avoid it by deciding at layout time; here
 * this one-line script sits right after the table while the HTML is still being parsed, measures
 * its parent (the list body), runs the SAME rule (`roomRule`) over the columns present in the
 * header, and records their positions on `<html>`. `NO_ROOM_CSS` hides those positions. The table's own
 * markup is untouched, so React's hydration matches the server; `clearNoRoomMarks` removes the
 * mark once React has applied the real hidden set.
 */
export function noRoomScript(specs: readonly EntityColumnSpec<never>[], reserve: number = ROW_ACTIONS_WIDTH): string {
  const info: Record<string, RoomItem> = {};
  for (const spec of specs)
    info[spec.id] = {
      id: spec.id,
      w: widthOf(spec),
      p: typeof spec.priority === "number" ? spec.priority : null,
      l: Boolean(spec.locked),
    };
  return `(function(){try{
var rule=${roomRule.toString()};
var info=${JSON.stringify(info)};
var s=document.currentScript,body=s&&s.parentElement;
if(!body||window.innerWidth<640)return;
var table=body.querySelector("table");if(!table)return;
var ths=Array.prototype.slice.call(table.querySelectorAll("thead th[data-matrx-table-column-id]"));
var items=[];ths.forEach(function(th){var it=info[th.getAttribute("data-matrx-table-column-id")];if(it)items.push(it)});
var cs=getComputedStyle(body);
var inner=body.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);
var gone=rule(items,Math.floor(inner/8)*8,${reserve});
if(!gone.length)return;
var pos=[];ths.forEach(function(th,i){if(gone.indexOf(th.getAttribute("data-matrx-table-column-id"))>=0)pos.push(i+1)});
if(pos.length)document.documentElement.setAttribute("${NO_ROOM_ATTR}",pos.join(" "));
}catch(_){}})()`;
}

/** Remove the pre-hydration mark (React now owns which columns exist). */
export function clearNoRoomMarks(_root?: ParentNode): void {
  document.documentElement.removeAttribute(NO_ROOM_ATTR);
}
