"use client";

/**
 * ChatConnectorStrip — the connector strip, wired to real account state.
 *
 * `ConnectorStrip` is presentational on purpose. This container draws exactly
 * three live integrations from a fair randomized bag and opens the complete
 * live directory through the canonical WindowPanel overlay.
 *
 * Every eligible integration appears once before the bag resets. At a cycle
 * boundary, the previous visit's three are deferred so consecutive visits do
 * not repeat when the catalogue is large enough.
 */

import { useEffect, useRef, useState } from "react";
import { useOpenLiveIntegrationsWindow } from "@/features/overlays/openers/liveIntegrationsWindow";
import { ConnectorStrip } from "./ConnectorStrip";
import { drawConnectorRotation, parseConnectorRotationState } from "./rotation";
import { useLiveConnectors } from "./useLiveConnectors";

const ROTATION_STORAGE_KEY = "matrx.connector-strip.rotation.v1";

export interface ChatConnectorStripProps {
  className?: string;
}

export function ChatConnectorStrip({ className }: ChatConnectorStripProps) {
  const { items, connect, isLoading } = useLiveConnectors();
  const openLiveIntegrations = useOpenLiveIntegrationsWindow();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const hasDrawnRef = useRef(false);
  const eligibleSignature = items
    .map(({ connector }) => connector.id)
    .sort()
    .join("|");

  useEffect(() => {
    if (isLoading || !eligibleSignature || hasDrawnRef.current) return;
    hasDrawnRef.current = true;
    const eligibleIds = eligibleSignature.split("|");

    let previous = null;
    try {
      previous = parseConnectorRotationState(
        window.localStorage.getItem(ROTATION_STORAGE_KEY),
      );
    } catch (cause) {
      console.warn("[connectors] Rotation state could not be read", cause);
    }

    const result = drawConnectorRotation(eligibleIds, previous);
    setSelectedIds(result.selectedIds);

    try {
      window.localStorage.setItem(
        ROTATION_STORAGE_KEY,
        JSON.stringify(result.state),
      );
    } catch (cause) {
      console.warn("[connectors] Rotation state could not be saved", cause);
    }
  }, [eligibleSignature, isLoading]);

  const itemById = new Map(items.map((item) => [item.connector.id, item]));
  const selectedItems = selectedIds
    .map((id) => itemById.get(id))
    .filter((item) => item !== undefined);

  if (isLoading || selectedItems.length === 0) return null;

  return (
    <ConnectorStrip
      connectors={selectedItems.map(({ connector }) => connector)}
      resolveStatus={(connector) =>
        itemById.get(connector.id)?.status ?? "not_connected"
      }
      onConnect={(id) => void connect(id)}
      onShowMore={() => openLiveIntegrations()}
      className={className}
    />
  );
}
