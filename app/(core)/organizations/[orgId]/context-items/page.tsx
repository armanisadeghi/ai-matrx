"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";
import { canManageSettings } from "@/features/organizations/types";
import { ContextItemsHub } from "@/features/scope-system/components/ContextItemsHub";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchScopeTypes } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import type { Organization } from "@/features/organizations/types";

// Org-level context items: every scope type in the org, grouped. Same component
// as the per-type page, just without a typeParam.
export default function OrgContextItemsPage() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  const dispatch = useAppDispatch();

  const [org, setOrg] = React.useState<Organization | null>(null);
  const [canManage, setCanManage] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function resolve() {
      try {
        const resolved = await getOrganizationBySlugOrId(orgSlugOrId);
        if (!resolved) {
          setError("Organization not found");
          return;
        }
        setOrg(resolved);
        dispatch(fetchScopeTypes(resolved.id));
        const role = await getUserRole(resolved.id);
        setCanManage(role ? canManageSettings(role) : false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    resolve();
  }, [orgSlugOrId, dispatch]);

  if (loading || !org) {
    return (
      <div className="h-dvh flex items-center justify-center bg-textured">
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
    <div className="h-dvh overflow-y-auto bg-textured">
      <div className="max-w-4xl mx-auto px-6 md:px-8 pt-12 pb-12">
        <ContextItemsHub
          orgId={org.id}
          orgSlugOrId={orgSlugOrId}
          orgName={org.name}
          orgIsPersonal={org.isPersonal}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
