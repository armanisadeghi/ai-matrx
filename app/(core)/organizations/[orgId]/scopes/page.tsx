"use client";

// Dedicated scopes surface for an organization. Resolves the org and hands
// it off to ScopesManager, which renders a minimal org-identity header
// followed by per-scope-type cards with inline add/edit/open flows.

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";
import { ScopesManager } from "@/features/scopes/components/management/ScopesManager";
import type { Organization } from "@/features/organizations/types";

export default function OrgScopesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlugOrId = params.orgId as string;

  const [organization, setOrganization] = React.useState<Organization | null>(
    null,
  );
  const [role, setRole] = React.useState<string | null>(null);
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
        setOrganization(org);
        const r = await getUserRole(org.id);
        setRole(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    resolve();
  }, [orgSlugOrId]);

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !organization) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8">
          <h2 className="text-lg font-semibold mb-2">Couldn't load</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {error ?? "Organization not found"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/organizations")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Organizations
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
        <ScopesManager organization={organization} role={role} />
      </div>
    </div>
  );
}
