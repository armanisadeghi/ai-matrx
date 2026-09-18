"use client";

import { GoogleWorkspaceOverviewBody } from "@/features/google-workspace/GoogleWorkspaceOverviewBody";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";

/** Settings host for the same Google overview content used by the WindowPanel. */
export function GoogleWorkspaceSettingsOverview() {
  const openGoogleConnect = useOpenGoogleConnectWindow();

  return (
    <GoogleWorkspaceOverviewBody
      onAddAccount={() => openGoogleConnect({ mode: "workspace" })}
      onManageWorkspace={(connectionId) =>
        openGoogleConnect({
          mode: "workspace",
          initialConnectionId: connectionId,
        })
      }
    />
  );
}
