import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — Bing connection setup is an agency operation now. */
export default function MarketingBingConnectionShim() {
  permanentRedirect(marketingRoutes.connectionsBing());
}
