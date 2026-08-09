// lib/entity-list/doors.ts
//
// THE DOOR LAW for the canonical list shell.
//
// Every list built on `lib/entity-list` shows records that have an identity in
// our system, so every one of them owes the user a door on the record's name —
// a REAL anchor, so cmd-click, middle-click, "open in new tab" and keyboard
// focus all work. Before this module the shell declared no `href` anywhere and
// rows navigated by `onRowOpen` alone: /agents/all and /transcripts (and every
// future config) were mouse-only dead ends.
//
// The door is resolved from the config's ENTITY TOKEN through
// `resolveEntityDoors` — the ONE route resolver (components/official/entity-ref
// /doors.ts) — so a config gets its door for free the moment it names its
// token, and a registry edit moves every list at once. A surface whose records
// live in a second shell (a system agent under /administration/…) passes
// `hrefFor` and wins over the registry.
//
// Consumed by `EntityListTable` (the default view) via `MatrxColumnDef.href`,
// and exported for the `views.cards` / `views.rows` render props so an
// alternate view cannot silently be a poorer door than the table.

import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import type { EntityListConfig } from "./config";

/**
 * Column ids that mean "this cell is the record's name". Checked in order, so
 * a surface declaring both gets the more specific one. A config whose title
 * column is called something else names it explicitly via `door.column` — the
 * heuristic never guesses at an arbitrary id, because putting the anchor on
 * the wrong cell is its own defect.
 */
const NAME_COLUMN_IDS = ["name", "title"] as const;

/** The token for one row — a plain token, or resolved per row (mixed lists). */
function tokenForRow<TRow>(
  config: EntityListConfig<TRow>,
  row: TRow,
): string | null {
  const token = config.door?.token;
  if (!token) return null;
  return (typeof token === "function" ? token(row) : token) ?? null;
}

/**
 * The canonical route for one row, or `undefined` when this record has no door.
 *
 * `hrefFor` is honoured EXACTLY when present — a config that deliberately
 * returns `undefined` for a row must not fall through to the registry and send
 * the user somewhere the surface ruled out.
 *
 * No shipped config exercises the `undefined` branch today (transcripts'
 * `primaryRowHref` returns a route for every kind), so it lives on the unit
 * tests. It is kept because the alternative — falling back to the registry —
 * silently overrides a surface that said "not this row", and that is the
 * failure this whole module exists to prevent.
 */
export function entityListRowHref<TRow>(
  config: EntityListConfig<TRow>,
  row: TRow,
): string | undefined {
  const door = config.door;
  if (!door) return undefined;
  if (door.hrefFor) return door.hrefFor(row) ?? undefined;

  const token = tokenForRow(config, row);
  if (!token) return undefined;
  const id = config.getRowId(row);
  if (!id) return undefined;
  return resolveEntityDoors(token, id).href ?? undefined;
}

/**
 * Which column carries the record's door — explicit `door.column`, else the
 * first declared name/title column. `null` when the surface declared no door
 * at all, or declared one and has no recognisable name column (in which case
 * it must say `door.column` rather than have the shell anchor a random cell).
 */
export function entityListDoorColumnId<TRow>(
  config: EntityListConfig<TRow>,
): string | null {
  const door = config.door;
  if (!door) return null;
  if (door.column) return door.column;
  for (const candidate of NAME_COLUMN_IDS) {
    const spec = config.columns.find((c) => c.id === candidate);
    if (spec) return spec.id;
  }
  return null;
}
