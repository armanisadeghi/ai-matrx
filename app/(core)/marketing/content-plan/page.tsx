import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. The content plan is per brand now, at /marketing/[brand]/content/plan.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingContentPlanListShim() {
  permanentRedirect(marketingRoutes.brands());
}
