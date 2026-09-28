"use client";

import { IntegrationsWorkspace } from "@/features/settings/pages/IntegrationsSettingsPage";

/** The same directory used by Settings, framed by the chat's floating window. */
export function LiveIntegrationsList() {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <IntegrationsWorkspace embedded />
    </div>
  );
}
