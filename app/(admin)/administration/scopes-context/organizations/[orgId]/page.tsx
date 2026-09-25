"use client";

// /administration/scopes-context/organizations/<orgId> — the platform-admin
// scope console for ANY organization, member or not (THE ADMIN LANE).
// Thin route wrapper: the console is the same ScopeManagerPage an
// organization's own admins use on /organizations/<id>/settings/scopes, in its
// admin-lane mode — the one tree loader reads this organization through the
// platform-admin arm, and releases it when the page closes. Only routes under
// /administration may pass `adminLane`; a user page never does.

import { useParams } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { ScopeManagerPage } from "@/features/agent-context/components/scope-admin/ScopeManagerPage";

export default function AdminOrganizationScopesPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const org = useAppSelector((s) => s.scopesTree.organizations[orgId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-baseline gap-2 border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold text-foreground">
          {org?.name ?? "Organization"} — scopes
        </h1>
        <span className="text-xs text-muted-foreground">
          {org?.admin_lane
            ? "Platform admin view: you are not a member of this organization."
            : org
              ? "You are a member of this organization."
              : null}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ScopeManagerPage
          organizationId={orgId}
          organizationName={org?.name ?? ""}
          isPersonal={org?.is_personal}
          adminLane
        />
      </div>
    </div>
  );
}
