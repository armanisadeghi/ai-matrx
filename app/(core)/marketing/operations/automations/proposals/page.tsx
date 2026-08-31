import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { OrganizationRunConsoleMount } from "@/features/marketing/seo/run-console/OrganizationRunConsoleMount";

/**
 * One run-console result screen at the ORGANIZATION tier, on its own route.
 * `view` fixes the screen; the bare `/marketing/operations/automations` URL
 * stays "This run". See `features/marketing/seo/run-console/FEATURE.md`.
 */

export const metadata: Metadata = {
  title: "Automation proposals",
  description:
    "The keyword placements the engine proposes for the brands your organization controls, waiting on your ruling.",
};

export default function MarketingAutomationProposalsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Automations
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <OrganizationRunConsoleMount view="proposals" />
      </div>
    </>
  );
}
