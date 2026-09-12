"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { useResolvedOrganization, useUserRole } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { hrSettingsHref } from "@/features/hr/routes";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { UniversalSettingsProvider, useUniversalSettings } from "@/features/settings/universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "@/features/settings/universal/UniversalSettingsPane";
import { Skeleton } from "@ai-matrx/design-system";

function OrganizationConfigurationRows() {
  const settings = useUniversalSettings();
  if (settings.isLoading) return <SuspenseLoader size="sm" message="Reading organization configuration…" />;
  if (settings.error) {
    return <SettingsCallout tone="error" title="Configuration could not be read">{settings.error}</SettingsCallout>;
  }
  if (settings.missing.length > 0) return <SettingsCallout tone="error" title="Some settings resolved to nothing">{settings.missing.map((knob) => knob.full_key).join(", ")} — the register and the code disagree.</SettingsCallout>;
  const knobs = settings.knobs.filter((knob) => !knob.feature.startsWith("hr."));
  if (knobs.length === 0) {
    return (
      <SettingsCallout tone="info" title="No organization controls are registered yet">
        Organization controls will appear here when they are available.
      </SettingsCallout>
    );
  }
  return <UniversalSettingsRows knobs={knobs} />;
}

export default function OrgConfigurationPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { organization, organizationId, loading, error, refresh } = useResolvedOrganization(orgId);
  const { loading: roleLoading, isOwner, isAdmin } = useUserRole(organizationId ?? undefined);
  if (loading || roleLoading) return <div className="space-y-3 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /></div>;
  if (error || !organization || !organizationId) return <OrganizationAccessGate orgSlugOrId={orgId} organizationId={organizationId ?? undefined} onRetry={refresh} />;
  const canEdit = isOwner || isAdmin;

  return <>
    <PageHeader><CrumbTrailHeader trail={[
      { label: organization.name, href: `/organizations/${orgId}` },
      { label: "Settings", href: `/organizations/${orgId}/settings` },
      { label: "Configuration" },
    ]} /></PageHeader>
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]"><div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{organization.name}&rsquo;s configuration, on top of the platform&rsquo;s.</p>
        <p className="mt-1 text-muted-foreground">
          Set preferences for this organization or inherit the platform default.
          HR settings live on <Link className="underline" href={hrSettingsHref(null, { org: organizationId })}>their own page</Link>.
        </p>
        {!canEdit && <p className="mt-2 text-muted-foreground">You can view this organization&rsquo;s configuration; changing it is owner/admin only.</p>}
      </div>
      <UniversalSettingsProvider key={`organization:${organizationId}`} target="organization" organizationId={organizationId} organizationName={organization.name} canManageOrganization={canEdit}>
        <SettingsDesignProvider variant="compact">
          <OrganizationConfigurationRows />
        </SettingsDesignProvider>
      </UniversalSettingsProvider>
    </div></div>
  </>;
}
