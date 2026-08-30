import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * `/marketing/calendar` never was a calendar — it mounted the Google
 * read-only sweep workspace (owned-calendar agenda, Tasks, YouTube Analytics,
 * Tag Manager), which is where that surface actually lives now.
 */
export default function MarketingCalendarShim() {
  permanentRedirect(`${marketingRoutes.connectionsGoogle()}/read-only`);
}
