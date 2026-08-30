import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Initiatives now live on the brand, at /marketing/[brand]/planning/initiatives.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingInitiativesShim() {
  permanentRedirect(marketingRoutes.brands());
}
