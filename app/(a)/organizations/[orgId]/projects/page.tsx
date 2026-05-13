"use client";

import React from "react";
import { Puzzle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { ProjectList } from "@/features/projects/components/ProjectList";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";

/**
 * Organization Projects Page
 * Route: /organizations/[orgId]/projects
 */
export default function OrgProjectsPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);
  const [orgSlug, setOrgSlug] = React.useState<string>("");
  const [userOrgRole, setUserOrgRole] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) return;
        setResolvedOrgId(org.id);
        setOrgSlug(org.slug);
        const role = await getUserRole(org.id);
        setUserOrgRole(role);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId]);

  const canCreate = userOrgRole === "owner" || userOrgRole === "admin";

  return (
    <OrgResourceLayout
      resourceName="Projects"
      icon={<Puzzle className="h-4 w-4" />}
    >
      {loading || !resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ProjectList
          organizationId={resolvedOrgId}
          orgSlug={orgSlug}
          canCreate={canCreate}
        />
      )}
    </OrgResourceLayout>
  );
}
