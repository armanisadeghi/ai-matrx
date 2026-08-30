import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the approval queue is an agency operation now. */
export default function MarketingApprovalsShim() {
  permanentRedirect(marketingRoutes.approvals());
}
