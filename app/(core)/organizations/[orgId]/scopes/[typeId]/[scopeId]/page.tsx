"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { ScopeDetailEditor } from "@/features/scope-system/components/ScopeDetailEditor";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchScopeTypes } from "@/features/agent-context/redux/scope/scopeTypesSlice";

export default function ScopeDetailPage() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  const typeId = params.typeId as string;
  const scopeId = params.scopeId as string;
  const dispatch = useAppDispatch();

  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function resolve() {
      try {
        const org = await getOrganizationBySlugOrId(orgSlugOrId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrgId(org.id);
        dispatch(fetchScopeTypes(org.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    resolve();
  }, [orgSlugOrId, typeId, dispatch]);

  if (loading || !orgId) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        {error ? (
          <Card className="p-8 max-w-md">
            <p className="text-sm text-muted-foreground">{error}</p>
          </Card>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        )}
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <ScopeDetailEditor
          orgId={orgId}
          orgSlugOrId={orgSlugOrId}
          typeParam={typeId}
          scopeParam={scopeId}
        />
      </div>
    </div>
  );
}
