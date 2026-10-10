// providers/MeetHostCore.tsx
//
// The engine half of the app's one Meet mount (Method C, provider variant — see
// providers/MeetHost.tsx for the contract). It is the ONLY module in the shell's
// lazy graph that imports `<MeetProvider>` / `<IncomingCallHost>`; it renders
// nothing itself and publishes the live `MeetHost` up to the context the shell
// already owns, so the app's children never remount when it arrives.

"use client";

import { useEffect } from "react";
import { IncomingCallHost, MeetProvider, useMeetHost } from "@ai-matrx/meet/react";
import type { MeetHost } from "@ai-matrx/meet/react";
import type { useMeetMemberIdentity } from "./MeetHost";

export interface MeetHostCoreProps {
  identity: ReturnType<typeof useMeetMemberIdentity>;
  organizationId: string | null;
  onHost: (host: MeetHost | null) => void;
}

function HostPublisher({ onHost }: { onHost: (host: MeetHost | null) => void }) {
  const host = useMeetHost();
  useEffect(() => {
    onHost(host);
    return () => onHost(null);
  }, [host, onHost]);
  return null;
}

export default function MeetHostCore({ identity, organizationId, onHost }: MeetHostCoreProps) {
  return (
    <MeetProvider {...identity} organizationId={organizationId}>
      <HostPublisher onHost={onHost} />
      {/* Mount ONCE, high in the tree — a call rings on every surface. */}
      <IncomingCallHost />
    </MeetProvider>
  );
}
