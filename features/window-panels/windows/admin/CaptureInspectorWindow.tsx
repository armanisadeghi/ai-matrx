"use client";

/**
 * CaptureInspectorWindow — the floating-window form of the Capture Inspector.
 *
 * Shows every HTTP exchange the browser made, both directions, sourced from the
 * `fetch` tap (`lib/diagnostics/stream-capture/`). Coverage does not depend on
 * which client or feature made the call, which is the whole point: the panel it
 * replaces could only ever show streams that went through `processStream`.
 *
 * Ephemeral by design — this is a debug surface over a live in-memory buffer.
 * Restoring it on reload would reopen a window onto a buffer that no longer
 * holds what it showed.
 */

import { useCallback, useState } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import CaptureInspectorPanel from "@/features/admin/capture-inspector/CaptureInspectorPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";

interface CaptureInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialExchangeId?: string | null;
}

function CaptureInspectorWindowInner({
  onClose,
  initialExchangeId,
}: {
  onClose: () => void;
  initialExchangeId: string | null;
}) {
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;
  const [selectedId, setSelectedId] = useState<string | null>(initialExchangeId);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ initialExchangeId: selectedId }),
    [selectedId],
  );

  return (
    <WindowPanel
      id="capture-inspector-window"
      title="Capture Inspector"
      onClose={onClose}
      width={980}
      height={660}
      minWidth={560}
      minHeight={360}
      overlayId="captureInspectorWindow"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
    >
      <CaptureInspectorPanel
        isAdmin={isAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </WindowPanel>
  );
}

export default function CaptureInspectorWindow({
  isOpen,
  onClose,
  initialExchangeId,
}: CaptureInspectorWindowProps) {
  if (!isOpen) return null;
  return (
    <CaptureInspectorWindowInner
      onClose={onClose}
      initialExchangeId={initialExchangeId ?? null}
    />
  );
}
