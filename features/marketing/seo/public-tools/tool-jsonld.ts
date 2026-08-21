import { siteConfig } from "@/config/extras/site";
import { MARKETING_PUBLIC_TOOLS } from "@/features/marketing/lib/marketing-nav";

/**
 * Structured data for the free public SEO tools on `/seo/*`.
 *
 * The name and description are looked up from MARKETING_PUBLIC_TOOLS — the
 * same declaration that drives the /seo index, /marketing/tools, and the
 * sitemap — so the structured data cannot drift from what the page and the
 * links actually say. A tool that is not a LIVE public tool in that registry
 * gets NO structured data rather than invented data.
 *
 * THE HONESTY RULE (common-docs/systems/marketing/ai-matrx-internal-seo/VISION.md and
 * the robots-tester plan's search-surface checklist): emit only properties the
 * visible page genuinely supports. These tools really are free, browser-based,
 * and require no account, so `offers` at price 0 and `isAccessibleForFree` are
 * true statements. We never emit aggregateRating, review, or a fake offer —
 * Google penalizes it and, more to the point, it would be a lie.
 */

export interface PublicToolJsonLdOptions {
  /** Route of the tool, e.g. `/seo/robots-tester`. Must be a live public tool. */
  href: string;
  /**
   * Overrides the registry name when the page's H1 is the better public label
   * (the registry label is the in-app menu wording). Keep it truthful — it
   * should match the visible H1.
   */
  name?: string;
  /** Overrides the registry description. Should match the meta description. */
  description?: string;
}

export function buildPublicToolJsonLd({
  href,
  name,
  description,
}: PublicToolJsonLdOptions): Record<string, unknown>[] {
  const tool = MARKETING_PUBLIC_TOOLS.find((entry) => entry.href === href);
  // Not a live registered public tool → no structured data. Never invent one:
  // a reserved ("coming-soon") route must not describe itself as an app.
  if (!tool) return [];

  const url = `${siteConfig.url}${href}`;

  const webApplication: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: name ?? tool.label,
    description: description ?? tool.description,
    url,
    applicationCategory: "DeveloperApplication",
    // Browser-based: there is no OS requirement and no download.
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript.",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    publisher: {
      "@type": "Organization",
      name: "AI Matrx",
      url: siteConfig.url,
    },
  };

  const breadcrumb: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "SEO Tools",
        item: `${siteConfig.url}/seo`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: name ?? tool.label,
        item: url,
      },
    ],
  };

  return [webApplication, breadcrumb];
}
