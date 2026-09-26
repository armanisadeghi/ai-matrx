import { notFound, redirect } from "next/navigation";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import {
  IntelligenceTargetRoute,
  intelligencePageTitle,
  splitQuery,
} from "@/features/mandates/feature-intelligence/IntelligenceTargetRoute";
import {
  featureIntelligenceHref,
  intelligenceDomainHref,
  resolveIntelligenceSlug,
} from "@/features/mandates/feature-intelligence/hrefs";
import {
  NO_DOMAIN_TARGET,
  isTarget,
} from "@/features/mandates/feature-intelligence/placement";

/**
 * /intelligence/[feature] — the AI jobs of one registry Feature (its id from
 * the registry: `seo`, `local-listings`), or `unassigned` for jobs with no
 * Domain yet (features/mandates/feature-intelligence). `?mandate=<key>`
 * focuses one job; any other value (`setId`, `brandId`, …) fills place links.
 * An old page id (`marketing`, `podcast`, `content_plan`) redirects to the
 * Feature all its jobs moved to, or to its Domain's section of the directory.
 */

const SLUG_RE = /^[a-z][a-z0-9_-]*$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  const title = isTarget(feature)
    ? intelligencePageTitle(feature)
    : "Intelligence";
  return createDynamicRouteMetadata("/mandates", {
    title,
    description: `The AI jobs in ${title.replace(/ intelligence$/, "")}, what runs them, and where.`,
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
  if (
    SLUG_RE.test(feature) &&
    (isTarget(feature) || feature === NO_DOMAIN_TARGET)
  ) {
    return (
      <IntelligenceTargetRoute
        target={feature}
        path={`/intelligence/${feature}`}
        query={query}
      />
    );
  }

  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(`/intelligence/${feature}`));

  // An old page id keeps working: a focused job opens on its own page, and the
  // id itself lands on the Feature its jobs moved to or on its Domain.
  const { focus, context } = splitQuery(query);
  if (SLUG_RE.test(feature) && focus) {
    redirect(featureIntelligenceHref(feature, { mandateKey: focus, context }));
  }
  const destination = SLUG_RE.test(feature)
    ? resolveIntelligenceSlug(feature)
    : null;
  if (destination && "target" in destination) {
    redirect(featureIntelligenceHref(destination.target, { context }));
  }
  if (destination && "domain" in destination)
    redirect(intelligenceDomainHref(destination.domain));
  // An unknown slug is a real 404 — never an empty page that looks like a
  // feature with no jobs.
  notFound();
}
