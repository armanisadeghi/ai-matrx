import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Outreach now lives on the brand, alongside /marketing/[brand]/email.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingOutreachShim() {
  permanentRedirect(marketingRoutes.brands());
}
