import { redirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default function MarketingAiVisibilityPage() {
  redirect(marketingRoutes.sites());
}
