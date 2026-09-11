"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SandboxDiagnosticsPanel } from "@/features/code/views/sandboxes/SandboxDiagnosticsPanel";

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
  if (!isOpen) return null;

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
    >
      <NonEditableContextMenu
        sourceFeature="code-editor"
        contentSource={{ type: "raw" }}
        contextData={{ content: title?.trim() || sandboxId }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <SandboxDiagnosticsPanel sandboxId={sandboxId} />
          </div>
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
