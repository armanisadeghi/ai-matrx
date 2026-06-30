"use client";

/**
 * MinimizedWindowContent — the body of a minimized WindowPanel shell.
 *
 * When a window is minimized it shrinks to a ~270×100 card showing only its
 * header; this fills the previously-empty body with the canonical tray preview
 * (`TrayChipPreview` — custom / snapshot / default, in that order) and makes the
 * whole area click-to-restore. It is the single seam that brings the tray
 * preview registry to the *production* minimized state (the standalone
 * `WindowTray` dock is the other consumer).
 *
 * `windowId` is the registry lookup key — pass the window's `overlayId` when it
 * has one (overlay-managed windows), falling back to the runtime id. A window
 * with no registered preview lands on the default muted label, so this is safe
 * for every window, not just those with a bespoke preview.
 */

import { getStaticEntryByOverlayId } from "../registry/windowRegistryMetadata";
import { TrayChipPreview } from "./TrayChipPreview";

interface MinimizedWindowContentProps {
  /** Registry key — `overlayId` for overlay-managed windows, else runtime id. */
  windowId: string;
  /** Window title; falls back to the registry label when not a plain string. */
  title?: string;
  /** Restore (un-minimize) the window. Wired to a click on the whole body. */
  onRestore?: () => void;
}

export function MinimizedWindowContent({
  windowId,
  title,
  onRestore,
}: MinimizedWindowContentProps) {
  const label = title ?? getStaticEntryByOverlayId(windowId)?.label ?? "";

  return (
    <button
      type="button"
      onClick={onRestore}
      title="Click to restore"
      className="flex min-h-0 flex-1 flex-col text-left focus:outline-none"
    >
      <TrayChipPreview windowId={windowId} title={label} />
    </button>
  );
}

export default MinimizedWindowContent;
