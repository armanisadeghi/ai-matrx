"use client";

/**
 * TrayChipPreview — renders the body row of a minimized tray chip.
 *
 * Three rendering modes, in priority order:
 *
 *   1. **Custom**   — registry provides `renderTrayPreview` returning JSX
 *                    (best fidelity; opt-in per window-type)
 *   2. **Snapshot** — the image captured at minimize time and stored in
 *                    `traySnapshotMap`. Every window without a custom
 *                    renderer is a candidate — WindowPanel falls back to the
 *                    fleet-wide `defaultTraySnapshotCapture` when neither the
 *                    prop nor the registry supplies a capture.
 *   3. **Default**  — generic muted "label · category" line + subtle hint,
 *                    shown while a capture is pending or when it was
 *                    skipped/failed.
 *
 * Each mode falls through gracefully — a missing snapshot or a render error
 * lands on the default body without breaking the chip.
 */

import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getStaticEntryByOverlayId } from "../registry/windowRegistryMetadata";
import { getTrayPreviewEntry } from "../registry/trayPreviewRegistry";
import type { TrayPreviewContext } from "../registry/windowRegistryTypes";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOverlayData } from "@/lib/redux/slices/overlaySlice";
import { getTraySnapshot, subscribeTraySnapshotMap } from "./traySnapshotMap";

interface TrayChipPreviewProps {
  /** Static registry key, normally the overlay id. */
  registryKey: string;
  /** Unique runtime window id used for the local snapshot cache. */
  snapshotKey: string;
  overlayInstanceId?: string;
  previewData?: Record<string, unknown>;
  title: string;
}

/**
 * Stable instance id default. Multi-instance windows that need their own
 * preview should pass through the proper instance via `windowId` already
 * including any instance suffix — for v1 we look up the singleton bucket.
 */
const DEFAULT_INSTANCE_ID = "default";

/** Narrow persisted overlay `data` (stored as `unknown`) to a plain object. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const TrayChipPreview = memo(function TrayChipPreview({
  registryKey,
  snapshotKey,
  overlayInstanceId = DEFAULT_INSTANCE_ID,
  previewData,
  title,
}: TrayChipPreviewProps) {
  // Static metadata for label fallback. Tray-preview callbacks live in a
  // SEPARATE registry (`trayPreviewRegistry`) so the chip render path doesn't
  // pull in the dynamic-import graph that used to hang off `windowRegistry`.
  const staticEntry = getStaticEntryByOverlayId(registryKey);
  const trayPreview = getTrayPreviewEntry(registryKey);

  // Pull the persisted overlay data so renderTrayPreview can read window-
  // specific state (last note title, file name, message preview, etc.).
  const overlayData = useAppSelector((state) =>
    staticEntry
      ? selectOverlayData(
          state as Parameters<typeof selectOverlayData>[0],
          staticEntry.overlayId,
          overlayInstanceId,
        )
      : null,
  );
  const collectedData = useAppSelector(
    (state) => state.windowManager.windows[snapshotKey]?.persistence?.data,
  );

  // ── 1. Custom render mode ────────────────────────────────────────────────
  if (trayPreview?.renderTrayPreview && staticEntry) {
    const ctx: TrayPreviewContext = {
      data:
        previewData ??
        collectedData ??
        (isPlainRecord(overlayData) ? overlayData : {}),
      overlayId: staticEntry.overlayId,
      instanceId: overlayInstanceId,
      title,
    };
    try {
      return (
        <div className="flex-1 px-3 py-1 overflow-hidden text-xs text-muted-foreground">
          {trayPreview.renderTrayPreview(ctx)}
        </div>
      );
    } catch (err) {
      // Custom renderer threw — fall through to snapshot/default rather
      // than blowing up the entire tray. Log in dev for debugging.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[TrayChipPreview] renderTrayPreview threw for "${registryKey}":`,
          err,
        );
      }
    }
  }

  // ── 2 + 3. Snapshot with default fallback ────────────────────────────────
  // Every window without a custom renderer is a snapshot candidate now that
  // WindowPanel falls back to the fleet-wide default capture. While the async
  // capture is pending (or when it was skipped/failed), the styled default
  // body renders in place.
  return (
    <TraySnapshotImage
      snapshotKey={snapshotKey}
      registryLabel={staticEntry?.label ?? null}
      category={staticEntry?.category ?? null}
      title={title}
    />
  );
});

// ─── Default body ─────────────────────────────────────────────────────────────

const DefaultTrayChipBody = memo(function DefaultTrayChipBody({
  registryLabel,
  category,
  title,
}: {
  registryLabel: string | null;
  category: string | null;
  title: string;
}) {
  const label = registryLabel ?? title;
  return (
    <div className="flex flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-muted/45 via-background to-primary/5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 flex-col gap-1 rounded-md border border-border/60 bg-background/70 p-1.5 shadow-sm"
        >
          <span className="h-1 w-4 rounded-full bg-primary/45" />
          <span className="h-1 w-3 rounded-full bg-muted-foreground/25" />
          <span className="h-1 w-4 rounded-full bg-muted-foreground/15" />
        </div>
        <span className="min-w-0 truncate text-xs font-medium text-foreground/85">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
        <span className="truncate uppercase tracking-wide">
          {category ?? "Window"}
        </span>
        <span className="shrink-0">Click to restore</span>
      </div>
    </div>
  );
});

// ─── Snapshot image ───────────────────────────────────────────────────────────

const TraySnapshotImage = memo(function TraySnapshotImage({
  snapshotKey,
  registryLabel,
  category,
  title,
}: {
  snapshotKey: string;
  registryLabel: string | null;
  category: string | null;
  title: string;
}) {
  const [snapshot, setSnapshot] = useState<string | null>(() =>
    getTraySnapshot(snapshotKey),
  );

  // Subscribe to snapshot map changes — the snapshot is captured asynchronously
  // after the window minimizes, so the chip may render before the data url is
  // ready. The observer pattern lets us update without polling.
  useEffect(() => {
    const unsubscribe = subscribeTraySnapshotMap(() => {
      setSnapshot(getTraySnapshot(snapshotKey));
    });
    return unsubscribe;
  }, [snapshotKey]);

  if (!snapshot) {
    // Snapshot not yet captured, skipped, or failed — render the styled
    // default body so the chip never sits on blank space.
    return (
      <DefaultTrayChipBody
        registryLabel={registryLabel}
        category={category}
        title={title}
      />
    );
  }

  return (
    <div className="flex-1 overflow-hidden bg-muted/30 relative">
      <img
        src={snapshot}
        alt=""
        className={cn(
          "w-full h-full object-cover",
          "opacity-90 hover:opacity-100 transition-opacity",
        )}
        draggable={false}
      />
    </div>
  );
});
