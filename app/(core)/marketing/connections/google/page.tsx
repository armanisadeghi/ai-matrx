import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — Google connection setup is an agency operation now. */
export default function MarketingGoogleConnectionShim() {
  permanentRedirect(marketingRoutes.connectionsGoogle());
}
