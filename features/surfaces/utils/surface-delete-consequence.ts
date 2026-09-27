/**
 * What deleting a `ui.ui_surface` row destroys, in one sentence — the ONE
 * source for every delete confirmation of a surface (list row, peek panel).
 *
 * Checked against the live foreign keys 2026-09-27: the delete CASCADES to
 * the surface's synced values, write targets, item types, agent roles, client
 * tools, config and tool defaults; child surfaces and agent shortcuts lose
 * their link (SET NULL). There is no archive column — deactivating is the
 * reversible alternative. A surface with a code manifest is re-created by the
 * next Sync manifests, so deleting it only destroys its bindings.
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
  const lost = `Permanently removes this surface with its ${parts.join(", ")}, plus its write targets, agent roles and config. Child surfaces lose their parent. There is no undo.`;
  const alt = hasManifest
    ? " Its code manifest re-creates the row on the next Sync manifests, so this only destroys the bindings — remove the manifest in code instead."
    : " Deactivate it instead to hide it and keep everything.";
  return lost + alt;
}
