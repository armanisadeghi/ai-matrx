/**
 * components/dialogs/clipboard-fallback/ClipboardFallbackHostImpl.tsx
 *
 * Heavy implementation of the global manual-copy host, mounted lazily by
 * `ClipboardFallbackHost.tsx`. Same queue-and-drain shape as
 * `ConfirmDialogHostImpl.tsx`: requests from `showManualCopy(...)` queue
 * in a ref and present one at a time through `<ClipboardFallbackDialog>`.
 */

"use client";

import * as React from "react";

import { ClipboardFallbackDialog } from "./ClipboardFallbackDialog";
import {
  _registerManualCopyHost,
  _unregisterManualCopyHost,
  type ManualCopyOptions,
} from "./manualCopyOpener";

export default function ClipboardFallbackHostImpl() {
  const [active, setActive] = React.useState<ManualCopyOptions | null>(null);
  const [tick, setTick] = React.useState(0);
  const queueRef = React.useRef<ManualCopyOptions[]>([]);

  React.useEffect(() => {
    const controller = {
      show: (opts: ManualCopyOptions) => {
        queueRef.current.push(opts);
        setTick((n) => n + 1);
      },
    };
    _registerManualCopyHost(controller);
    return () => _unregisterManualCopyHost(controller);
  }, []);

  // Drain the queue whenever nothing is showing.
  React.useEffect(() => {
    if (active === null && queueRef.current.length > 0) {
      setActive(queueRef.current.shift()!);
    }
  }, [active, tick]);

  if (!active) return null;

  return (
    <ClipboardFallbackDialog
      open
      onOpenChange={(open) => {
        if (!open) setActive(null);
      }}
      url={active.text}
      title={active.title ?? "Copy manually"}
      description={
        active.description ??
        "This browser blocked automatic copying. The text is selected — press Cmd/Ctrl+C, or try the Copy button."
      }
    />
  );
}
