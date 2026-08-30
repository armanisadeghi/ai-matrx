import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the connection hub is an agency operation now. */
export default function MarketingConnectionsShim() {
  permanentRedirect(marketingRoutes.connections());
}
