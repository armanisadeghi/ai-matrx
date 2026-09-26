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
import { AdminPageCapture } from "@/components/agent-copy/page-capture/AdminPageCapture";
import { useRecordTitle } from "@/lib/record-title/record-title";

export default function AdminOrganizationScopesPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const org = useAppSelector((s) => s.scopesTree.organizations[orgId]);
  // The breadcrumb and the tab say the organization's name, from the organizations
  // index this console already loads — never its id (VERIFIER-25).
  useRecordTitle(org?.name);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-baseline gap-2">
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
        <AdminPageCapture
          title={`${org?.name ?? "Organization"} — scopes`}
          route={`/administration/scopes-context/organizations/${orgId}`}
          identity={{ organization_id: orgId, organization_name: org?.name ?? null }}
          sections={[
            {
              id: "scope-types",
              title: "Scope types",
              role: "data",
              value: (org?.scope_types ?? []).map((t) => ({
                label: t.label_plural,
                scope_count: t.scopes.length,
                updated_at: t.updated_at,
              })),
            },
          ]}
        />
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
