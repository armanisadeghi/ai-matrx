import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — keyword data quality is an agency operation now. */
export default function KeywordDataQualityShim() {
  permanentRedirect(marketingRoutes.dataQuality());
}
