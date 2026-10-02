"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ActiveMillerColumns } from "@/features/scopes/components/active-context/miller-columns/ActiveMillerColumns";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectProjectId,
  selectProjectName,
  selectScopeSelectionsContext,
  selectTaskId,
  selectTaskName,
} from "@/lib/redux/slices/appContextSlice";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { dialogCapture } from "@/components/agent-copy/page-capture/pageCapture";
import { PageCaptureButton } from "@/components/agent-copy/page-capture/PageCaptureButton";

/**
 * The window's alchemy capture (lane ALCHEMY-BUTTON): while open it IS what the person sees —
 * the working context the Miller Columns set, by name and id.
 */
function WorkingContextCapture() {
  const orgId = useAppSelector(selectOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const projectId = useAppSelector(selectProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectTaskId);
  const taskName = useAppSelector(selectTaskName);
  const scopes = useAppSelector(selectScopeSelectionsContext);
  usePageCapture(() =>
    dialogCapture({
      title: "Scopes",
      route: typeof window !== "undefined" ? window.location.pathname : "",
      dialog: "Scopes window",
      selection: {
        Organization: { id: orgId, name: orgName },
        Project: { id: projectId, name: projectName },
        Task: { id: taskId, name: taskName },
      },
      sections: [
        {
          id: "scope-selections",
          title: "Selected scopes by scope type",
          description: "Each scope type id mapped to its chosen scope id.",
          role: "data",
          value: scopes,
        },
      ],
    }),
  );
  return <PageCaptureButton size="xs" />;
}

export interface ContextSwitcherWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId?: string;
}

export function ContextSwitcherWindow({
  isOpen,
  onClose,
  instanceId = "default",
}: ContextSwitcherWindowProps) {
  if (!isOpen) return null;

  return (
    <NonEditableContextMenu
      sourceFeature="system"
      contentSource={{ type: "raw" }}
      contextData={{ content: "Scopes" }}
    >
      <WindowPanel
        id={`context-switcher-${instanceId}`}
        title="Scopes"
        onClose={onClose}
        minWidth={680}
        minHeight={500}
        width={940}
        height={650}
        position="center"
        overlayId="contextSwitcherWindow"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 justify-end px-2 pt-1">
          <WorkingContextCapture />
        </div>
        <ActiveMillerColumns
          variant="full"
          className="min-h-0 flex-1 rounded-none border-0"
        />
      </WindowPanel>
    </NonEditableContextMenu>
  );
}
