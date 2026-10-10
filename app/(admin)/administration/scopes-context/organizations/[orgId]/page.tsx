"use client";

// /administration/scopes-context/organizations/<orgId> — the platform-admin
// scope console for ANY organization, member or not (THE ADMIN LANE).
// Thin route wrapper: the console is the same ScopesManager an
// organization's own admins use on /organizations/<id>/scopes, in its
// admin-lane mode — the one tree loader reads this organization through the
// platform-admin arm, and releases it when the page closes. Only routes under
// /administration may pass `adminLane`; a user page never does.

import { useParams } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { ScopesManager } from "@/features/scopes/components/management/ScopesManager";
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
              ? "Platform admin view; you are not a member."
              : org
                ? "Member view; you belong to it."
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
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <ScopesManager
          organization={{ id: orgId, name: org?.name ?? "", slug: org?.slug ?? orgId, logoUrl: null }}
          role="admin"
          adminLane
        />
      </div>
    </div>
  );
}
