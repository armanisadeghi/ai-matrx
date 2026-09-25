import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { FeatureIntelligence } from "@/features/mandates/feature-intelligence/FeatureIntelligence";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { canonicalFeature, declaredPlacesFor } from "@/features/mandates/feature-intelligence/registry";

/**
 * /intelligence/[feature] — the AI jobs of one feature, from the viewer's seat
 * (features/mandates/feature-intelligence). `?mandate=<key>` focuses one job;
 * any other query value (`setId`, `brandId`, …) fills the feature's place links.
 */

const FEATURE_RE = /^[a-z][a-z0-9_]*$/;

function titleOf(feature: string): string {
  const declared = declaredPlacesFor(feature)?.label;
  if (declared) return declared;
  return feature
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  const safeFeature = FEATURE_RE.test(feature) ? feature : "";
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">
          {titleOf(feature)} intelligence
        </span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        {safeFeature ? (
          <FeatureIntelligence
            feature={safeFeature}
            context={context}
            focusMandateKey={focus}
            showTitle={false}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            That is not a feature name. Open intelligence from a page that uses AI.
          </p>
        )}
      </div>
    </>
  );
}
