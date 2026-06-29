// app/(core)/knowledge/graph/KnowledgeGraphClient.tsx
//
// Client shell for the org-wide knowledge graph.
//
// Org resolution order:
//   1. `?org=<slug|id>` URL param (lets the org workspace deep-link a filtered
//      graph) — a slug is resolved to its org id.
//   2. The user's active org from appContextSlice (read-only — Surface A owns
//      writes).
// When neither is set the backend org-wide query still returns the global
// (NULL-org) corpus, so we pass null and let the canvas render.

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { KgGraphCanvas } from "@/features/kg-graph/components/KgGraphCanvas";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function KnowledgeGraphClient({
  orgParam,
  scopeParam = null,
  scopeTypeParam = null,
}: {
  orgParam?: string | null;
  scopeParam?: string | null;
  scopeTypeParam?: string | null;
}) {
  const active = useActiveContext();
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<boolean>(Boolean(orgParam));

  useEffect(() => {
    let cancelled = false;
    // Syncing local state to the URL param is the legitimate use case
    // the rule warns about — these synchronous setStates aren't a
    // cascading render trigger.
    if (!orgParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedOrgId(null);
      setResolving(false);
      return undefined;
    }
    if (UUID_RE.test(orgParam)) {
      setResolvedOrgId(orgParam);
      setResolving(false);
      return undefined;
    }
    setResolving(true);
    (async () => {
      const org = await getOrganizationBySlugOrId(orgParam);
      if (!cancelled) {
        setResolvedOrgId(org?.id ?? null);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgParam]);

  if (orgParam && resolving) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const organizationId = orgParam
    ? resolvedOrgId
    : (active.organizationId ?? null);

  return (
    <KgGraphCanvas
      mode="org"
      organizationId={organizationId}
      initialScopeId={scopeParam}
      initialScopeTypeId={scopeTypeParam}
    />
  );
}
