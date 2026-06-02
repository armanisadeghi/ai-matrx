// app/(core)/knowledge-graph/KnowledgeGraphClient.tsx
//
// Client shell for the org-wide knowledge graph. Resolves the user's active org
// from the global appContextSlice (read-only — Surface A owns writes) and hands
// it to the shared KgGraphCanvas in mode="org". When no org is active the
// backend org-wide query still returns the global (NULL-org) corpus, so we pass
// whatever is set and let the canvas render.

"use client";

import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { KgGraphCanvas } from "@/features/kg-graph/components/KgGraphCanvas";

export function KnowledgeGraphClient() {
  const active = useActiveContext();
  return (
    <KgGraphCanvas mode="org" organizationId={active.organizationId ?? null} />
  );
}
