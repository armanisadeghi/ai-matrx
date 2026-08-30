import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the cross-site rank portfolio is an agency report now. */
export default function MarketingRanksShim() {
  permanentRedirect(marketingRoutes.ranksRollup());
}
