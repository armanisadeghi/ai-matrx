"use client";

// The scraper's answer to "no organization selected": one plain line and the
// organization picker, never the transport's sentence, a stack or the
// Diagnostics JSON. The platform's ONE notice for this state
// (`OrganizationRequiredNotice`) draws it; the scrape re-runs by itself once
// an organization is picked (`useRetryWhenOrganizationPicked`).

import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useRetryWhenOrganizationPicked } from "@/features/scraper/hooks/useRetryWhenOrganizationPicked";

export function ScrapeOrganizationPrompt({
  onPicked,
  className,
}: {
  /** Re-run the scrape the person already asked for. */
  onPicked: () => void;
  className?: string;
}) {
  useRetryWhenOrganizationPicked(true, onPicked);
  return (
    <OrganizationRequiredNotice
      compact
      title="Choose an organization to read this page"
      description="Pick the organization you are working in — the page loads by itself as soon as you do."
      className={className}
    />
  );
}
