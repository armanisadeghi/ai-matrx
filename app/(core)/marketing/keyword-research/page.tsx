import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Keyword research now lives on one site's SEO practice, at /marketing/[brand]/seo/[site]/keywords.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingKeywordResearchShim() {
  permanentRedirect(marketingRoutes.brands());
}
