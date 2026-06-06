"use client";

/**
 * Settings layout shell.
 *
 * Intentionally minimal: it provides ONE scroll container for the settings
 * subtree and the `OrgSettingsLayoutProvider` context that `GeneralSettings`
 * uses to refresh the header after an edit. The old chrome (a second header bar
 * + an org-switcher sidebar with its own scroller) was removed — it created a
 * nested/dual-scroll and a redundant "Manage › General" nav. The pages
 * underneath (`OrgManage`, `ScopeManagerPage`) own their content + headers.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useOrganization } from "@/features/organizations/hooks";
import { OrgSettingsLayoutProvider } from "@/features/organizations/components/OrgSettingsLayoutContext";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

export default function OrgSettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const orgId = params.orgId as string;

  // Resolve the org UUID so useOrganization (which needs a UUID) can expose a
  // refresh for the layout context.
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!cancelled && org) setResolvedOrgId(org.id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const { refresh: refreshLayoutOrganization } = useOrganization(
    resolvedOrgId ?? "",
  );

  // Passthrough — no own scroll container. Each page underneath owns its single
  // scroll container (the proven pattern that avoids a nested/dual scroll with
  // the app's `.shell-main`).
  return (
    <OrgSettingsLayoutProvider
      refreshLayoutOrganization={refreshLayoutOrganization}
    >
      {children}
    </OrgSettingsLayoutProvider>
  );
}
