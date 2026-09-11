"use client";

import { useRef, useState } from "react";
import { Activity, CheckCircle2, RefreshCw, RotateCcw } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SandboxDiagnosticsPanel,
  type SandboxDiagnosticsHandle,
  type SandboxDiagnosticsStatus,
} from "@/features/code/views/sandboxes/SandboxDiagnosticsPanel";

export interface SandboxManagementWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sandboxId: string;
  title?: string;
}

/**
 * A movable frame for the canonical sandbox diagnostics and controls.
 * `SandboxDiagnosticsPanel` owns the actual data, refresh, filesystem, and
 * reset behaviour so its detail, terminal, and window presentations agree.
 */
export default function SandboxManagementWindow({
  isOpen,
  onClose,
  sandboxId,
  title,
}: SandboxManagementWindowProps) {
  const diagnosticsRef = useRef<SandboxDiagnosticsHandle>(null);
  const [status, setStatus] = useState<SandboxDiagnosticsStatus | null>(null);

  if (!isOpen) return null;

  const footer = (
    <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {status?.overallOk ? (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
          >
            <CheckCircle2 className="h-3 w-3" /> Ready
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
            <Activity className="h-3 w-3 animate-pulse" /> Checking
          </Badge>
        )}
        {status && (
          <span className="truncate text-xs text-muted-foreground">
            {status.template ?? "default"} · {status.tier}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => diagnosticsRef.current?.requestRebuild()}
          title="Replace the container with its configured template and resources. Your persistent home is kept unless you explicitly erase it."
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Rebuild
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => diagnosticsRef.current?.refresh()}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
    </div>
  );

  return (
    <WindowPanel
      id="sandbox-management-window"
      overlayId="sandboxManagementWindow"
      title={title?.trim() || "Sandbox management"}
      onClose={onClose}
      minWidth={620}
      minHeight={440}
      width={920}
      height={680}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footer={footer}
      footerVariant="rich"
    >
      <NonEditableContextMenu
        sourceFeature="code-editor"
        contentSource={{ type: "raw" }}
        contextData={{ content: title?.trim() || sandboxId }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <SandboxDiagnosticsPanel
              ref={diagnosticsRef}
              sandboxId={sandboxId}
              compact
              onStatusChange={setStatus}
            />
          </div>
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
