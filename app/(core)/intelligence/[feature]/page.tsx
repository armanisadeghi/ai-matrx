import { notFound, redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { FeatureIntelligence } from "@/features/mandates/feature-intelligence/FeatureIntelligence";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import {
  canonicalFeature,
  declaredPlacesFor,
  featureDisplayName,
} from "@/features/mandates/feature-intelligence/registry";

/**
 * /intelligence/[feature] — the AI jobs of one feature, from the viewer's seat
 * (features/mandates/feature-intelligence). `?mandate=<key>` focuses one job;
 * any other query value (`setId`, `brandId`, …) fills the feature's place links.
 */

const FEATURE_RE = /^[a-z][a-z0-9_]*$/;

function titleOf(feature: string): string {
  return featureDisplayName(feature);
}

/** A feature exists when it declares places or owns at least one live job. */
async function featureHasJobs(feature: string): Promise<boolean> {
  if (declaredPlacesFor(feature)) return true;
  const supabase = await createClient();
  const { data } = await mandateDefinitions(supabase)
    .select("mandate_key")
    .like("mandate_key", `${feature.replace(/_/g, "\\_")}.%`)
    .is("deleted_at", null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** A near-miss slug a person types (`podcasts` for `podcast`). */
function aliasOf(feature: string): string | null {
  const candidates = feature.endsWith("s")
    ? [feature.slice(0, -1)]
    : [`${feature}s`];
  return candidates.find((candidate) => declaredPlacesFor(candidate)) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  return createDynamicRouteMetadata("/mandates", {
    title: `${titleOf(feature)} intelligence`,
    description: `The AI jobs in ${titleOf(feature)}, what runs them, and where.`,
    letter: "IN",
  });
}

export default async function FeatureIntelligenceRoute({
  params,
  searchParams,
}: {
  params: Promise<{ feature: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ feature }, query] = await Promise.all([params, searchParams]);
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(`/intelligence/${feature}`));

  const context: Record<string, string> = {};
  let focus: string | null = null;
  for (const [name, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    if (name === "mandate") focus = value;
    else context[name] = value;
  }

  // A key prefix another feature owns (`seo` → `marketing`) opens that page.
  const owner = FEATURE_RE.test(feature) ? canonicalFeature(feature) : feature;
  if (owner !== feature) {
    const query = new URLSearchParams(
      Object.entries(context).concat(focus ? [["mandate", focus]] : []),
    ).toString();
    redirect(`/intelligence/${owner}${query ? `?${query}` : ""}`);
  }
  // An unknown slug is a real 404 — never an empty page that looks like a
  // feature with no jobs. A near-miss of a declared feature redirects.
  if (!FEATURE_RE.test(feature) || !(await featureHasJobs(feature))) {
    const alias = FEATURE_RE.test(feature) ? aliasOf(feature) : null;
    if (alias) redirect(`/intelligence/${alias}`);
    notFound();
  }
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">
          {titleOf(feature)} intelligence
        </span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <FeatureIntelligence
          feature={feature}
          context={context}
          focusMandateKey={focus}
          showTitle={false}
        />
      </div>
    </>
  );
}
