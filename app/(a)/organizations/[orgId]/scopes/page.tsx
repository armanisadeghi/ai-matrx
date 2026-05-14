"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { ScopesGrid } from "@/features/scope-system/components/ScopesGrid";

export default function ScopesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlugOrId = params.orgId as string;

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
  if (error || !orgId) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8">
          <h2 className="text-lg font-semibold mb-2">Couldn’t load</h2>
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
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <ScopesGrid orgId={orgId} orgSlugOrId={orgSlugOrId} />
      </div>
    </div>
  );
}
