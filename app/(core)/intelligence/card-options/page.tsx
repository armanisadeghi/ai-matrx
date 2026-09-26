import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CardOptionsDemo } from "@/features/mandates/feature-intelligence/card-options/CardOptionsDemo";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

/**
 * /intelligence/card-options — ten layouts of the Intelligence job card over
 * the same three real research mandates, with live data and live controls,
 * for Arman to choose from (2026-09-26).
 */

export const metadata = createRouteMetadata("/mandates", {
  title: "Job card options",
  description: "Ten layouts of the Intelligence job card.",
  letter: "IN",
});

export default async function CardOptionsRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/intelligence/card-options"));
  return (
    <>
      <PageHeader>
        <span className="truncate text-sm font-medium text-foreground">Job card options</span>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <CardOptionsDemo />
      </div>
    </>
  );
}
