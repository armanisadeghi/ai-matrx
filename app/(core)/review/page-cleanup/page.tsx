import { ListChecks } from "lucide-react";
import { forbidden, redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import PageCleanupReview from "@/features/admin/page-cleanup/PageCleanupReview";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { loginHref } from "@/utils/auth/auth-destination";
import { createRouteMetadata } from "@/utils/route-metadata";

/**
 * /review/page-cleanup — super-admin review list of pages nothing in the app links to
 * (features/admin/page-cleanup). Lives in (core), not (admin), so each link opens the app's own
 * page on the same site.
 */
export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/review/page-cleanup", {
  titlePrefix: "Admin",
  title: "Page cleanup",
  letter: "PC",
});

export default async function PageCleanupPage() {
  const status = await getCurrentUserAdminStatus();
  if (!status) redirect(loginHref("/review/page-cleanup"));
  if (status.level !== "super_admin") forbidden();
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Page cleanup</h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <PageCleanupReview />
      </div>
    </>
  );
}
