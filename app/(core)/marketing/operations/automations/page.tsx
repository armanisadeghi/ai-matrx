
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { OrganizationRunConsoleMount } from "@/features/marketing/seo/run-console/OrganizationRunConsoleMount";

/**
 * The run console at the ORGANIZATION tier — an AGENCY-plane operation (it
 * drives every brand the organization controls), moved here from the flat
 * `/marketing/automations` in the 2026-08-28 agency restructure. One site's
 * automations live at /marketing/[brand]/seo/[site]/automations.
 *
 * KI-049: the same component the system tier mounts at
 * `/administration/marketing/run-console`, scoped to the active organization
 * instead of the whole platform — see
 * `features/marketing/seo/run-console/OrganizationRunConsoleMount.tsx` and
 * `features/marketing/seo/run-console/FEATURE.md`.
 */

export default function MarketingAutomationsPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Automations" }} />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <OrganizationRunConsoleMount />
      </div>
    </>
  );
}
