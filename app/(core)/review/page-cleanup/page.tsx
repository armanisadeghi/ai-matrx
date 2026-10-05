import { forbidden, redirect } from "next/navigation";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
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
      <RecordPageHeader record={{ name: "Page cleanup" }} />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <PageCleanupReview />
      </div>
    </>
  );
}
