import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Audience now lives on the brand, under /marketing/[brand]/intelligence.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingAudienceShim() {
  permanentRedirect(marketingRoutes.brands());
}
