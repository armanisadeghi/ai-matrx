"use client";

/**
 * SurfaceAgentBindWindow — WindowPanel shell around SurfaceAgentBindPanel.
 *
 * Opened from any surface via useOpenSurfaceAgentBindWindow({ surfaceName }).
 */

import { useRef } from "react";
import { Link2 } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SurfaceAgentBindPanel } from "@/features/surfaces/components/bind/SurfaceAgentBindPanel";
import {
  emitSurfaceAgentBindEvent,
  type SurfaceAgentBindWindowData,
} from "./callbacks";

export interface SurfaceAgentBindWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  surfaceName: string;
  surfaceLabel?: string | null;
  initialAgentId?: string | null;
  callbackGroupId?: string | null;
}

export function SurfaceAgentBindWindow({
  isOpen,
  onClose,
  instanceId,
  surfaceName,
  surfaceLabel = null,
  initialAgentId = null,
  callbackGroupId = null,
}: SurfaceAgentBindWindowProps) {
  const lastBoundRef = useRef(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (!lastBoundRef.current) {
      emitSurfaceAgentBindEvent(callbackGroupId, {
        type: "window-close",
        instanceId,
      });
    }
    onClose();
  };

  return (
    <WindowPanel
      id={`surface-agent-bind-${instanceId}`}
      overlayId="surfaceAgentBindWindow"
      titleNode={
        <div className="flex min-w-0 items-center gap-2">
          <Link2
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate text-xs font-medium">
            Add agent to surface
          </span>
        </div>
      }
      onClose={handleClose}
      width={720}
      height={640}
      minWidth={420}
      minHeight={420}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <SurfaceAgentBindPanel
        surfaceName={surfaceName}
        surfaceLabel={surfaceLabel}
        initialAgentId={initialAgentId}
        onBound={(result) => {
          lastBoundRef.current = true;
          emitSurfaceAgentBindEvent(callbackGroupId, {
            type: "bound",
            instanceId,
            bindingId: result.bindingId,
            agentId: result.agentId,
            surfaceName: result.surfaceName,
          });
          onClose();
        }}
        onCancel={handleClose}
        className="h-full"
      />
    </WindowPanel>
  );
}

/** Narrow overlay data for the controller. */
export function parseSurfaceAgentBindWindowData(
  data: Record<string, unknown> | null | undefined,
): Pick<
  SurfaceAgentBindWindowData,
  "surfaceName" | "surfaceLabel" | "initialAgentId" | "callbackGroupId"
> {
  return {
    surfaceName: typeof data?.surfaceName === "string" ? data.surfaceName : "",
    surfaceLabel:
      typeof data?.surfaceLabel === "string" ? data.surfaceLabel : null,
    initialAgentId:
      typeof data?.initialAgentId === "string" ? data.initialAgentId : null,
    callbackGroupId:
      typeof data?.callbackGroupId === "string" ? data.callbackGroupId : null,
  };
}
