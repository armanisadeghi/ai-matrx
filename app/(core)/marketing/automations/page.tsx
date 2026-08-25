import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { OrganizationRunConsoleMount } from "@/features/marketing/seo/run-console/OrganizationRunConsoleMount";

/**
 * The run console at the ORGANIZATION tier.
 *
 * KI-049: the same component the system tier mounts at
 * `/administration/marketing/run-console`, scoped to the active organization
 * instead of the whole platform — see
 * `features/marketing/seo/run-console/OrganizationRunConsoleMount.tsx` and
 * `features/marketing/seo/run-console/FEATURE.md`.
 */

export const metadata: Metadata = {
  title: "Automations",
  description:
    "Drive the keyword-coverage engines by hand for the brands your organization controls, and author the schedule that overrides the system default.",
};

export default function MarketingAutomationsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Automations
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <OrganizationRunConsoleMount />
      </div>
    </>
  );
}
