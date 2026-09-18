"use client";

/**
 * WindowPanel composition for the reusable Google Workspace connect body.
 * The connect, account-selection, and Picker/import state lives in
 * `features/google-workspace/GoogleWorkspaceConnectBody.tsx` so it can also
 * compose into the Workspace overview and settings surfaces.
 */

import { ArrowLeft, FileText, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleDrive } from "@/components/icons/brand-icons";
import {
  closeGoogleWorkspaceConnect,
  GoogleWorkspaceConnectBody,
} from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import type { GoogleWorkspaceConnectBodyProps } from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import { GoogleWorkspaceOverviewBody } from "@/features/google-workspace/GoogleWorkspaceOverviewBody";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useEffect, useState } from "react";

const WINDOW_ID = "google-connect-window";
const OVERLAY_ID = "googleConnectWindow" as const;

export interface GoogleConnectWindowProps extends Omit<
  GoogleWorkspaceConnectBodyProps,
  "mode"
> {
  isOpen: boolean;
  mode?: "overview" | "workspace" | "drive-import";
}

export function GoogleConnectWindow({
  isOpen,
  mode = "workspace",
  onClose,
  callbackGroupId,
  initialConnectionId,
  ...bodyProps
}: GoogleConnectWindowProps) {
  const [view, setView] = useState<"overview" | "workspace">(
    mode === "overview" ? "overview" : "workspace",
  );
  const [workspaceInitialConnectionId, setWorkspaceInitialConnectionId] =
    useState<string | null>(initialConnectionId ?? null);
  useEffect(() => {
    setView(mode === "overview" ? "overview" : "workspace");
    setWorkspaceInitialConnectionId(initialConnectionId ?? null);
  }, [initialConnectionId, mode]);
  if (!isOpen) return null;

  const isOverview = view === "overview";
  const connectMode = mode === "drive-import" ? "drive-import" : "workspace";

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      onClose={() => closeGoogleWorkspaceConnect(callbackGroupId, onClose)}
      titleNode={
        <span className="flex items-center gap-1.5">
          {mode === "drive-import" ? (
            <GoogleDrive className="h-3.5 w-3.5 text-primary" />
          ) : isOverview ? (
            <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-primary" />
          )}
          {mode === "drive-import"
            ? "Import from Google Drive"
            : isOverview
              ? "Google"
              : "Google"}
        </span>
      }
      actionsRight={
        mode === "overview" && !isOverview ? (
          <Button size="sm" variant="ghost" onClick={() => setView("overview")}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to Google
          </Button>
        ) : undefined
      }
      width={isOverview ? 900 : 420}
      height={isOverview ? 680 : 480}
      minWidth={340}
      minHeight={320}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {isOverview ? (
        <GoogleWorkspaceOverviewBody
          initialConnectionId={workspaceInitialConnectionId}
          onAddAccount={() => {
            setWorkspaceInitialConnectionId(null);
            setView("workspace");
          }}
          onManageWorkspace={(connectionId) => {
            setWorkspaceInitialConnectionId(connectionId);
            setView("workspace");
          }}
        />
      ) : (
        <GoogleWorkspaceConnectBody
          {...bodyProps}
          callbackGroupId={callbackGroupId}
          initialConnectionId={
            mode === "overview"
              ? workspaceInitialConnectionId
              : initialConnectionId
          }
          mode={connectMode}
          onClose={onClose}
        />
      )}
    </WindowPanel>
  );
}

export default GoogleConnectWindow;
