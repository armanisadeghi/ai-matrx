/**
 * What moving a `ui.ui_surface` row to Trash does, in one sentence — the ONE
 * source for every Move-to-Trash confirmation of a surface (list row, peek
 * panel).
 *
 * Delete means archive (Arman, 2026-09-27): the row gets deleted_at and stays
 * restorable from Trash. Its config, item types and tool defaults follow it to
 * Trash through the platform soft-delete cascade and come back on restore; its
 * synced values, agent roles and bindings stay attached to the archived row.
 */

export interface SurfaceDeleteSubject {
  name: string;
  surfaceValueCount: number;
  agentCount: number;
  toolCount: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function surfaceDeleteConsequence(
  surface: SurfaceDeleteSubject,
  hasManifest: boolean,
): string {
  const parts = [
    plural(surface.surfaceValueCount, "synced value"),
    plural(surface.agentCount, "agent binding"),
    plural(surface.toolCount, "tool default"),
  ];
  const moved = `Moves this surface to Trash with its ${parts.join(", ")}, plus its write targets, agent roles and config. Agents stop seeing it. You can restore it from Trash with everything intact.`;
  const alt = hasManifest
    ? " It has a code manifest, so remove the manifest in code too, or deactivate it instead."
    : " Deactivate it instead if you only want to hide it.";
  return moved + alt;
}
