import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { IntelligenceIndex } from "@/features/mandates/feature-intelligence/IntelligenceIndex";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

/**
 * /intelligence — every AI job, grouped by registry Domain and Feature
 * (features/mandates/feature-intelligence). Each card opens
 * /intelligence/<feature>; `?domain=<id>` scrolls to one Domain (old page ids
 * that span several Features land there).
 */

export const metadata = createRouteMetadata("/mandates", {
  title: "Intelligence",
  description: "Every AI job in the app, by domain and feature.",
  letter: "IN",
});

export default async function IntelligenceIndexRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ isAuthenticated }, query] = await Promise.all([getSessionVerdict(), searchParams]);
  const domain = typeof query.domain === "string" ? query.domain : null;
  if (!isAuthenticated) {
    redirect(loginHref(domain ? `/intelligence?domain=${encodeURIComponent(domain)}` : "/intelligence"));
  }
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">Intelligence</span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <IntelligenceIndex focusDomain={domain} />
      </div>
    </>
  );
}
