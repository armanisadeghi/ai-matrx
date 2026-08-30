import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the cost roll-up is an agency report now. */
export default function MarketingCostShim() {
  permanentRedirect(marketingRoutes.cost());
}
