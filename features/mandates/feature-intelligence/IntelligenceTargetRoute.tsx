// features/mandates/feature-intelligence/IntelligenceTargetRoute.tsx
//
// The server half of every intelligence page (`/intelligence/<feature>`,
// `/intelligence/<domain>/unassigned`, `/intelligence/unassigned`): signs the
// viewer in, sends a focused job that belongs elsewhere to its own page, and
// renders the feature-agnostic body for one registry target.

import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { FeatureIntelligence } from "./FeatureIntelligence";
import { featureIntelligenceHref } from "./hrefs";
import {
  NOT_ASSIGNED_TO_FEATURE,
  NO_DOMAIN_TARGET,
  targetDomain,
  targetForKey,
  targetLabel,
} from "./placement";
import { registryDomain } from "./taxonomy";

export type RouteQuery = Record<string, string | string[] | undefined>;

/** `?mandate=` focuses one job; every other value fills place links. */
export function splitQuery(query: RouteQuery): {
  focus: string | null;
  context: Record<string, string>;
} {
  const context: Record<string, string> = {};
  let focus: string | null = null;
  for (const [name, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    if (name === "mandate") focus = value;
    else context[name] = value;
  }
  return { focus, context };
}

/** The page's title — the registry's words, never a raw id. */
export function intelligencePageTitle(target: string): string {
  if (target === NO_DOMAIN_TARGET) return targetLabel(target);
  if (target.endsWith("/unassigned")) {
    const domain = registryDomain(targetDomain(target) ?? "");
    return `${domain?.name ?? ""} — ${NOT_ASSIGNED_TO_FEATURE.toLowerCase()}`;
  }
  return `${targetLabel(target)} intelligence`;
}

export async function IntelligenceTargetRoute({
  target,
  path,
  query,
}: {
  target: string;
  /** This page's own path, for the sign-in return. */
  path: string;
  query: RouteQuery;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(path));

  const { focus, context } = splitQuery(query);
  // A focused job another page shows (an old link, a key that moved) opens there.
  if (focus && targetForKey(focus) !== target) {
    redirect(featureIntelligenceHref(target, { mandateKey: focus, context }));
  }
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">
          {intelligencePageTitle(target)}
        </span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <FeatureIntelligence
          feature={target}
          context={context}
          focusMandateKey={focus}
          showTitle={false}
        />
      </div>
    </>
  );
}
