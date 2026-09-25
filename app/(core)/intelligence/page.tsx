import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { IntelligenceIndex } from "@/features/mandates/feature-intelligence/IntelligenceIndex";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

/**
 * /intelligence — every feature's AI jobs, by feature
 * (features/mandates/feature-intelligence). Each row opens
 * /intelligence/<feature>.
 */

export const metadata = createRouteMetadata("/mandates", {
  title: "Intelligence by feature",
  description: "Every part of the app that uses AI, and the jobs it runs.",
  letter: "IN",
});

export default async function IntelligenceIndexRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/intelligence"));
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">Intelligence by feature</span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <IntelligenceIndex />
      </div>
    </>
  );
}
