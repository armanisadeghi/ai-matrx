/**
 * What a selection IS, in the person's words ("12 stickies", "3 tiles and 2 shapes") — the one
 * description the right-click menu's header (and anything else that names the selection) reads.
 * Pure: the host says what kind each selected id is.
 */
import type { ShapeKind } from "../engine/shapes";

export type SelectedKind = "tile" | "frame" | ShapeKind;

const NOUN: Record<string, [string, string]> = {
  tile: ["tile", "tiles"],
  frame: ["frame", "frames"],
  sticky: ["sticky", "stickies"],
  text: ["text", "texts"],
  shape: ["shape", "shapes"],
  drawing: ["drawing", "drawings"],
  connector: ["arrow", "arrows"],
};

function bucket(kind: SelectedKind): keyof typeof NOUN {
  if (kind === "rect" || kind === "rounded" || kind === "oval" || kind === "triangle" || kind === "diamond" || kind === "star") return "shape";
  if (kind === "pen") return "drawing";
  if (kind === "line" || kind === "arrow") return "connector";
  return kind as keyof typeof NOUN;
}

export function describeSelection(ids: readonly string[], kindOf: (id: string) => SelectedKind | undefined): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const kind = kindOf(id);
    if (!kind) continue;
    const b = bucket(kind);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const parts = [...counts].map(([b, n]) => `${n} ${NOUN[b][n === 1 ? 0 : 1]}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
