"use client";

import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

/** Client slot for `AppletHeader` — copies an `agent_app` RecordRef fence. */
export function AppletReferenceCopySlot({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  return (
    <ReferenceCopyButton
      referenceType="agent_app"
      id={appId}
      label={appName}
      toastLabel={appName}
      size="tap"
    />
  );
}
