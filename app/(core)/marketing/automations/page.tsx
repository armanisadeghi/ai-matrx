import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the organization run console is an agency operation now. */
export default function MarketingAutomationsShim() {
  permanentRedirect(marketingRoutes.automations());
}
