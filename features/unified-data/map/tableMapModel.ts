// features/unified-data/map/tableMapModel.ts — LANE TABLE-MAP
//
// THE MAP'S MODEL, pure: the data home's table rows plus the Fields `custom.table_map_fields` answered
// become cards (a table) and lines (a link between two of them), grouped by organization. A link to a
// table that is not on the map (another filter, a table she may not open) draws no line and is counted
// on its card instead — never a line to nowhere.

import type { TableMapFieldRow } from "@/features/unified-data/hub/doors";

export interface MapTableInput {
  tableId: string;
  name: string;
  href: string;
  organizationId: string | null;
  organizationName: string | null;
}

export interface MapCard {
  id: string;
  name: string;
  href: string;
  organizationId: string;
  /** The first columns, in the table's own order. Never more than `KEY_COLUMNS`. */
  keyColumns: string[];
  /** Links that point off this map (a table outside the current filter). */
  linksOffMap: number;
}

export interface MapLink {
  id: string;
  from: string;
  to: string;
  /** The link column's own label. */
  label: string;
  twoWay: boolean;
}

export interface MapGroup {
  organizationId: string;
  organizationName: string;
  cards: MapCard[];
}

export interface TableMap {
  groups: MapGroup[];
  links: MapLink[];
}

export const KEY_COLUMNS = 3;
const NO_ORG = "none";

export function buildTableMap(tables: readonly MapTableInput[], fields: readonly TableMapFieldRow[]): TableMap {
  const byTable = new Map<string, TableMapFieldRow[]>();
  for (const f of fields) {
    const list = byTable.get(f.table_id);
    if (list) list.push(f);
    else byTable.set(f.table_id, [f]);
  }
  const onMap = new Set(tables.map((t) => t.tableId));
  const links: MapLink[] = [];
  const seenPairs = new Set<string>();
  const groups = new Map<string, MapGroup>();

  for (const t of tables) {
    const own = (byTable.get(t.tableId) ?? []).slice().sort((a, b) => Number(a.field_sort ?? 0) - Number(b.field_sort ?? 0));
    let off = 0;
    for (const f of own) {
      if (!f.is_link || !f.relation_target) continue;
      if (!onMap.has(f.relation_target)) {
        off += 1;
        continue;
      }
      const twoWay = Boolean(f.inverse_key);
      // A two-way link is declared on both ends: one line, not two.
      const pair = [t.tableId, f.relation_target].sort().join("|");
      if (twoWay && seenPairs.has(pair)) continue;
      if (twoWay) seenPairs.add(pair);
      links.push({ id: `${t.tableId}:${f.field_key}`, from: t.tableId, to: f.relation_target, label: f.field_label || f.field_key, twoWay });
    }
    const orgId = t.organizationId ?? NO_ORG;
    let group = groups.get(orgId);
    if (!group) {
      group = { organizationId: orgId, organizationName: t.organizationName ?? "No organization", cards: [] };
      groups.set(orgId, group);
    }
    group.cards.push({
      id: t.tableId,
      name: t.name,
      href: t.href,
      organizationId: orgId,
      keyColumns: own.filter((f) => !f.is_link).slice(0, KEY_COLUMNS).map((f) => f.field_label || f.field_key),
      linksOffMap: off,
    });
  }
  const ordered = [...groups.values()].sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  for (const g of ordered) g.cards.sort((a, b) => a.name.localeCompare(b.name));
  return { groups: ordered, links };
}

export const CARD_W = 232;
export const CARD_H = 132;
const GAP_X = 56;
const GAP_Y = 48;
const HEAD_H = 40;
const GROUP_GAP = 72;
const PER_ROW = 3;

/** Fixed positions: each organization is a block of cards in rows of three, blocks stacked down the page. */
export function layoutMap(map: TableMap): { positions: Map<string, { x: number; y: number }>; heads: Array<{ id: string; name: string; x: number; y: number }> } {
  const positions = new Map<string, { x: number; y: number }>();
  const heads: Array<{ id: string; name: string; x: number; y: number }> = [];
  let y = 0;
  for (const g of map.groups) {
    heads.push({ id: g.organizationId, name: g.organizationName, x: 0, y });
    y += HEAD_H;
    g.cards.forEach((c, i) => {
      positions.set(c.id, { x: (i % PER_ROW) * (CARD_W + GAP_X), y: y + Math.floor(i / PER_ROW) * (CARD_H + GAP_Y) });
    });
    y += Math.ceil(g.cards.length / PER_ROW) * (CARD_H + GAP_Y) + GROUP_GAP - GAP_Y;
  }
  return { positions, heads };
}
