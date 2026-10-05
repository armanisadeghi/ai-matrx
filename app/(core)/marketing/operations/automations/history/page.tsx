import type { Metadata } from "next";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { OrganizationRunConsoleMount } from "@/features/marketing/seo/run-console/OrganizationRunConsoleMount";

/**
 * One run-console result screen at the ORGANIZATION tier, on its own route.
 * `view` fixes the screen; the bare `/marketing/operations/automations` URL
 * stays "This run". See `features/marketing/seo/run-console/FEATURE.md`.
 */

export const metadata: Metadata = {
  title: "Run history",
  description:
    "Every automation pass your organization has run, and what each one claimed, placed, and refused.",
};

export default function MarketingAutomationHistoryPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Automations" }} />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <OrganizationRunConsoleMount view="history" />
      </div>
    </>
  );
}
