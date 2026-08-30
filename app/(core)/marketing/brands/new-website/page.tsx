import { NewSiteForm } from "@/features/marketing/components/sites/NewSiteForm";

/**
 * New-website intake (was `/marketing/sites/new`).
 *
 * A static child of `/brands` so it can never collide with a brand key. The
 * form reads `?brand=` itself to pre-bind the site to a client — the query is
 * carried by `marketingRoutes.newSite(brandId)` and by the legacy shim.
 */
export default function NewMarketingSitePage() {
  return <NewSiteForm />;
}
