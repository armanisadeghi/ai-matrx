"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { canManageSettings } from "@/features/organizations/types";
import { ScopeDetailEditor } from "@/features/scope-system/components/ScopeDetailEditor";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchScopeTypes } from "@/features/agent-context/redux/scope/scopeTypesSlice";

export default function ScopeDetailPage() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  const typeId = params.typeId as string;
  const scopeId = params.scopeId as string;
  const dispatch = useAppDispatch();

  const { organization: org, organizationId, role, loading, error, refresh } =
    useResolvedOrganization(orgSlugOrId);
  const canManage = role ? canManageSettings(role) : false;

  React.useEffect(() => {
    if (org) dispatch(fetchScopeTypes(org.id));
  }, [org, dispatch]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // No org came back. WHY is not ours to guess — the gate asks the platform
  // and offers the owner a one-click way to say yes.
  if (!org) {
    return (
      <div className="h-dvh bg-textured">
        <OrganizationAccessGate
          orgSlugOrId={orgSlugOrId}
          organizationId={organizationId}
          error={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12">
        <ScopeDetailEditor
          orgId={org.id}
          orgSlugOrId={orgSlugOrId}
          typeParam={typeId}
          scopeParam={scopeId}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
