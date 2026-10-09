// app/(core)/knowledge/graph/KnowledgeGraphClient.tsx
//
// Client shell for the org-wide knowledge graph.
//
// Org resolution order:
// Org filter: `?org_filter=<slug|id>` (the org workspace's legacy `?org=` link
// is read too) — a slug is resolved to its org id. With none set the graph is
// ALL organizations (the backend org-wide query returns the union of the
// person's visible orgs plus the global corpus). The header's ACTIVE org never
// narrows this graph (policies/access-ladder.md).

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { KgGraphCanvas } from "@/features/kg-graph/components/KgGraphCanvas";
import { ReadFailure } from "@ai-matrx/design-system";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { isUuidShape } from "@ai-matrx/kit/uuid";

export function KnowledgeGraphClient({
  orgParam,
  scopeParam = null,
  scopeTypeParam = null,
}: {
  orgParam?: string | null;
  scopeParam?: string | null;
  scopeTypeParam?: string | null;
}) {
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<boolean>(Boolean(orgParam));
  // A failed slug read is said, never read as "no organization" (RC-B12 r13).
  const [orgReadError, setOrgReadError] = useState<unknown>(null);
  const [orgReadAttempt, setOrgReadAttempt] = useState(0);

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
    if (isUuidShape(orgParam)) {
      setResolvedOrgId(orgParam);
      setResolving(false);
      return undefined;
    }
    setResolving(true);
    setOrgReadError(null);
    (async () => {
      try {
        const org = await getOrganizationBySlugOrId(orgParam);
        if (!cancelled) {
          setResolvedOrgId(org?.id ?? null);
          setResolving(false);
        }
      } catch (err) {
        if (!cancelled) {
          setOrgReadError(err ?? new Error("The organization read failed"));
          setResolving(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgParam, orgReadAttempt]);

  if (orgParam && orgReadError != null) {
    return (
      <ReadFailure
        error={orgReadError}
        what="this organization"
        onRetry={() => setOrgReadAttempt((n) => n + 1)}
      />
    );
  }

  if (orgParam && resolving) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const organizationId = orgParam ? resolvedOrgId : null;

  return (
    <KgGraphCanvas
      mode="org"
      organizationId={organizationId}
      initialScopeId={scopeParam}
      initialScopeTypeId={scopeTypeParam}
    />
  );
}
