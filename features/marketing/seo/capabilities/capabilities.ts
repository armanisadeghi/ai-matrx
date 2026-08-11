export type SeoCapabilityGroup = "snapshot" | "catalogue" | "provider";

export interface SeoCapability {
  key: string;
  label: string;
  description: string;
  group: SeoCapabilityGroup;
  destination: string;
  evidenceLabel: string;
}

/**
 * The site SEO inventory is intentionally route-relative. It is the shared,
 * testable catalogue behind the capabilities page; execution and reads remain
 * owned by their existing workspaces.
 */
export function siteSeoCapabilities(sitePath: string): SeoCapability[] {
  return [
    {
      key: "snapshot-audit",
      label: "Snapshot audit",
      description:
        "Fast, deterministic checks stamped onto each page capture: indexability, search snippets, social metadata, headings, and URL quality.",
      group: "snapshot",
      destination: `${sitePath}/audit`,
      evidenceLabel: "Open audit results",
    },
    {
      key: "catalogue-analysis",
      label: "Catalogue analysis",
      description:
        "The deeper check catalogue turns stored crawl evidence into scored analysis results and a durable findings register.",
      group: "catalogue",
      destination: `${sitePath}/analysis`,
      evidenceLabel: "Open prioritized results",
    },
    {
      key: "findings-register",
      label: "Findings register",
      description:
        "Every unresolved catalogue finding, with affected pages, evidence, status, and remediation guidance.",
      group: "catalogue",
      destination: `${sitePath}/findings`,
      evidenceLabel: "Open all findings",
    },
    {
      key: "search-console",
      label: "Search Console",
      description:
        "Google search impressions, clicks, positions, queries, and indexed-page coverage for this site.",
      group: "provider",
      destination: "/marketing/search-console",
      evidenceLabel: "Explore Search Console",
    },
    {
      key: "page-speed",
      label: "PageSpeed",
      description:
        "Field and lab performance coverage, score distributions, regressions, and traffic-qualified repair priorities.",
      group: "provider",
      destination: `${sitePath}/performance`,
      evidenceLabel: "Open performance",
    },
    {
      key: "backlinks",
      label: "Backlinks",
      description:
        "Referring domains, anchors, target pages, link changes, and first-party quality assessments.",
      group: "provider",
      destination: `${sitePath}/backlinks`,
      evidenceLabel: "Open backlink intelligence",
    },
    {
      key: "rank-tracking",
      label: "Rank tracking",
      description:
        "Tracked keyword positions and movement for the site, separate from Search Console's observed query data.",
      group: "provider",
      destination: `${sitePath}/ranks`,
      evidenceLabel: "Open rank tracking",
    },
    {
      key: "provider-connections",
      label: "Provider connections",
      description:
        "See which Google and custom data sources are connected before diagnosing missing provider evidence.",
      group: "provider",
      destination: `${sitePath}/integrations`,
      evidenceLabel: "Manage connections",
    },
  ];
}
