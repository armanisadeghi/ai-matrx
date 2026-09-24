"use client";

// The 404 boundary for /agent-apps/[id] and every sub-route (code, run,
// settings, versions, v/[version]). Each page calls getAgentApp(), which
// throws notFound() on a null read; this boundary hands that to the canonical
// access gate, which tells denied / deleted / never existed / signed out apart
// instead of a hand-written "doesn't exist or you don't have permission".

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function AgentAppUnavailable() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="app"
        id={id}
        fallbackHref="/agent-apps"
        fallbackLabel="Your apps"
      />
    </div>
  );
}
