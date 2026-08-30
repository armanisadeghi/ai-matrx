import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Social now lives on the brand, at /marketing/[brand]/socials.
 * Which client's work this is can only be answered by a person, so the shim
 * lands on the client roster rather than guessing a brand.
 */
export default function MarketingSocialShim() {
  permanentRedirect(marketingRoutes.brands());
}
