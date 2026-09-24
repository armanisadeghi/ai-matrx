import { permanentRedirect } from "next/navigation";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveLegacySiteAddress } from "@/features/marketing/lib/shim-resolve-server";

/**
 * Legacy address for one site's Content Plan workspace. The plan is a BRAND
 * section now — /marketing/[brand]/content/plan/[site] — and its `?view=`
 * tabs are routes (tree is the index, so it carries no suffix). `?node=` is
 * row selection, not a screen, so it rides along unchanged.
 */
const PLAN_VIEWS = ["tree", "table", "map", "entities", "setup"];

export default async function ContentPlanSiteShim({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ view?: string; node?: string }>;
}) {
  const [{ siteId }, { view, node }] = await Promise.all([
    params,
    searchParams,
  ]);
  const address = await resolveLegacySiteAddress(siteId);
  if (!address) {
    // Unreadable site (denied, deleted, missing) — the canonical gate says
    // which, instead of silently dropping the person on the brand list.
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <AccessGate
          token="web_site"
          id={siteId}
          fallbackHref={marketingRoutes.brands()}
          fallbackLabel="Your brands"
        />
      </div>
    );
  }
  const target = marketingRoutes.brandContentPlanSite(
    address.brandSeg,
    address.siteSeg,
    view && PLAN_VIEWS.includes(view) ? view : undefined,
  );
  permanentRedirect(
    node ? `${target}?node=${encodeURIComponent(node)}` : target,
  );
}
