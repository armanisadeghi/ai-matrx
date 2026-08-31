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
import { Copy } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import CaptureInspectorPanel from "@/features/admin/capture-inspector/CaptureInspectorPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { useCapturedExchange } from "@/lib/diagnostics/stream-capture/useCapturedExchanges";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";
// context-menu-exempt: entity — a state dump of the fetch-tap buffer, not an app record; the selected exchange is copyable/exportable content, never an attachable entity

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
  // The panel already tracks the clicked/selected exchange as state (STATE,
  // not a ref), so the menu can read the same selection instead of inventing
  // a second per-row anchor over a panel this window does not own.
  const selectedExchange = useCapturedExchange(selectedId);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ initialExchangeId: selectedId }),
    [selectedId],
  );

  const exchangeSummary = () => {
    if (!selectedExchange) return "No exchange selected.";
    const lines = [
      `${selectedExchange.method} ${selectedExchange.url}`,
      `Status: ${selectedExchange.httpStatus} ${selectedExchange.statusText} (${selectedExchange.status})`,
      `Bytes: ${selectedExchange.bytes}`,
    ];
    if (selectedExchange.isStream) {
      lines.push(`Stream events: ${selectedExchange.events.length}`);
    }
    if (selectedExchange.error) lines.push(`Error: ${selectedExchange.error}`);
    return lines.join("\n");
  };

  const captureSection: ContextMenuExtraSection = {
    id: "capture-inspector",
    label: "Exchange",
    icon: Copy,
    items: [
      {
        kind: "item",
        id: "ci-copy-selected-json",
        label: "Copy exchange as JSON",
        icon: Copy,
        disabled: !selectedExchange,
        description: selectedExchange ? undefined : "Select an exchange first",
        onSelect: () => {
          if (!selectedExchange) return;
          void copyToClipboard(JSON.stringify(selectedExchange, null, 2), {
            formatJson: false,
            onSuccess: () => toast.success("Exchange copied"),
            onError: () => toast.error("Could not copy exchange"),
          });
        },
      },
    ],
  };

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
      <NonEditableContextMenu
        sourceFeature="admin"
        contentSource={{ type: "raw" }}
        contextData={{ content: exchangeSummary() }}
        extraSections={[captureSection]}
      >
        <CaptureInspectorPanel
          isAdmin={isAdmin}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </NonEditableContextMenu>
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
