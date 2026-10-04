/**
 * Every way the cell editor opens, as one place: a grid cell (All view), a queue
 * row ("Needs you" / "No rule yet", desktop and mobile), and a model's own rule
 * opened from inside the editor. `__tests__/editor-entry-points.test.tsx` renders
 * the editor from each of them.
 */
import type { GridCell, GridColumn, QueueItem } from "../model";
import type { TranslationCellRow, TranslationOffering } from "../types";
import type { EditorTarget } from "./TranslationCellEditor";

export function targetFor(gc: GridCell): EditorTarget {
  const column = gc.column;
  const overridden = new Set(gc.overrides.map((o) => o.offering.id));
  // No rule at this layer and none below it to start from: the editor opens with nothing chosen.
  const missing = !gc.cell && (gc.status === "missing" || !gc.fallback);
  return {
    layer: column.kind,
    ownerId: column.ownerId,
    ownerLabel: column.label,
    settingKey: gc.key,
    cell: gc.cell,
    initialRule: gc.cell || missing ? undefined : gc.fallback?.rule,
    covers: gc.cell ? gc.covers : missing ? gc.missing : column.members.filter((m) => !overridden.has(m.id)),
    fallbackLabel: column.kind === "profile" && gc.fallback ? "The API rule" : "The computed default",
    overrides: gc.overrides,
    missing,
  };
}

export function queueTarget(item: QueueItem): EditorTarget {
  if (item.gridCell)
    return { ...targetFor(item.gridCell), consumedBy: item.consumedBy, today: item.withoutText };
  const cell = item.cell as TranslationCellRow;
  return {
    layer: cell.layer,
    ownerId: cell.layer_owner_id,
    ownerLabel: item.groupLabel,
    settingKey: item.key,
    cell,
    covers: item.reach,
    fallbackLabel: item.without ? "The rule below it" : "The computed default",
    overrides: [],
    consumedBy: item.consumedBy,
  };
}

export function overrideTarget(
  column: GridColumn,
  key: string,
  o: { offering: TranslationOffering; cell: TranslationCellRow },
): EditorTarget {
  return {
    layer: "offering",
    ownerId: o.offering.id,
    ownerLabel: o.offering.model_name,
    settingKey: key,
    cell: o.cell,
    covers: [o.offering],
    fallbackLabel: `The ${column.label} rule`,
    overrides: [],
  };
}
