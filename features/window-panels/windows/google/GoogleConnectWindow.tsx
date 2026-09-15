"use client";

/**
 * WindowPanel composition for the reusable Google Workspace connect body.
 * The connect, account-selection, and Picker/import state lives in
 * `features/google-workspace/GoogleWorkspaceConnectBody.tsx` so it can also
 * compose into the Workspace overview and settings surfaces.
 */

import { FileText } from "lucide-react";
import { GoogleDrive } from "@/components/icons/brand-icons";
import {
  closeGoogleWorkspaceConnect,
  GoogleWorkspaceConnectBody,
} from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import type { GoogleWorkspaceConnectBodyProps } from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

const WINDOW_ID = "google-connect-window";
const OVERLAY_ID = "googleConnectWindow" as const;

export interface GoogleConnectWindowProps extends GoogleWorkspaceConnectBodyProps {
  isOpen: boolean;
}

export function GoogleConnectWindow({
  isOpen,
  mode = "workspace",
  onClose,
  callbackGroupId,
  ...bodyProps
}: GoogleConnectWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      onClose={() => closeGoogleWorkspaceConnect(callbackGroupId, onClose)}
      titleNode={
        <span className="flex items-center gap-1.5">
          {mode === "drive-import" ? (
            <GoogleDrive className="h-3.5 w-3.5 text-primary" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-primary" />
          )}
          {mode === "drive-import" ? "Import from Google Drive" : "Google"}
        </span>
      }
      width={420}
      height={480}
      minWidth={340}
      minHeight={320}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <GoogleWorkspaceConnectBody
        {...bodyProps}
        callbackGroupId={callbackGroupId}
        mode={mode}
        onClose={onClose}
      />
    </WindowPanel>
  );
}

export default GoogleConnectWindow;
