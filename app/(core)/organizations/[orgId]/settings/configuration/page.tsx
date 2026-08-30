"use client";

// /organizations/[orgId]/settings/configuration — the ORG rung of the
// scoped-configuration ladder (Code → System → Org → User; Arman 2026-08-27).
// Every org-overridable platform setting, grouped by feature: the platform
// default greyed with its basis, the org's override editable, one click back
// to inheriting. Reads/writes ride the ONE primitive (platform.knob_index /
// knob_override_set) — the same doors HR settings and the admin Limits &
// Knobs page use. HR's own keys are deliberately not repeated here: /hr/settings
// is their canonical surface (one door per operation).

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { hrSettingsHref } from "@/features/hr/routes";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { Skeleton } from "@ai-matrx/design-system";

export default function OrgConfigurationPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { organization, organizationId, loading, error, refresh } =
    useResolvedOrganization(orgId);
  const { loading: roleLoading, isOwner, isAdmin } = useUserRole(
    organizationId ?? undefined,
  );
  const {
    knobs,
    isLoading: knobsLoading,
    error: knobsError,
    refresh: refreshKnobs,
    missing,
  } = useScopedKnobs({ organizationId: organizationId ?? undefined });

  const byFeature = useMemo(() => {
    const groups = new Map<string, typeof knobs>();
    for (const knob of knobs) {
      if (knob.feature.startsWith("hr.")) continue; // canonical surface: /hr/settings
      if (!knob.overridable_by.includes("organization")) continue;
      const list = groups.get(knob.feature) ?? [];
      list.push(knob);
      groups.set(knob.feature, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [knobs]);

  if (loading || roleLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !organization || !organizationId) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgId}
        organizationId={organizationId ?? undefined}
        onRetry={refresh}
      />
    );
  }
  const canEdit = isOwner || isAdmin;

  return (
    <>
      <PageHeader>
        <CrumbTrailHeader
          trail={[
            { label: organization.name, href: `/organizations/${orgId}` },
            { label: "Settings", href: `/organizations/${orgId}/settings` },
            { label: "Configuration" },
          ]}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto max-w-4xl space-y-8 p-6">
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              Your organization&rsquo;s configuration, on top of the platform&rsquo;s.
            </p>
            <p className="mt-1 text-muted-foreground">
              Every setting starts at the platform default. Override one and it
              takes effect for this organization within a minute, with no
              deploy; clear it and the platform value applies again. HR
              settings live on{" "}
              <Link
                className="underline"
                href={hrSettingsHref(null, { org: organizationId })}
              >
                their own page
              </Link>
              .
            </p>
            {!canEdit && (
              <p className="mt-2 text-muted-foreground">
                You can see this organization&rsquo;s configuration; changing it
                is owner/admin only.
              </p>
            )}
          </div>

          {knobsError && <p className="text-sm text-destructive">{knobsError}</p>}
          {missing.length > 0 && (
            <p className="text-sm text-destructive" role="alert">
              {missing.length} configuration key{missing.length === 1 ? "" : "s"}{" "}
              resolved to nothing — the register and the code disagree.
            </p>
          )}
          {knobsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : byFeature.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No organization-overridable settings are registered outside HR yet.
            </p>
          ) : (
            byFeature.map(([feature, rows]) => (
              <section key={feature} className="space-y-3">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  {feature}
                </h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {rows.map((knob) => (
                    <KnobOverrideRow
                      key={knob.full_key}
                      knob={knob}
                      scopeKind="organization"
                      scopeId={organizationId}
                      organizationId={organizationId}
                      blastRadius="Applies to everyone in this organization."
                      showUserLockControl={canEdit}
                      onChanged={refreshKnobs}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
