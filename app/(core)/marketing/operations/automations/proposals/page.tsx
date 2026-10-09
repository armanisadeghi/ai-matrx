
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { OrganizationRunConsoleMount } from "@/features/marketing/seo/run-console/OrganizationRunConsoleMount";

/**
 * One run-console result screen at the ORGANIZATION tier, on its own route.
 * `view` fixes the screen; the bare `/marketing/operations/automations` URL
 * stays "This run". See `features/marketing/seo/run-console/FEATURE.md`.
 */

export default function MarketingAutomationProposalsPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Automations" }} />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <OrganizationRunConsoleMount view="proposals" />
      </div>
    </>
  );
}
