// /notifications — THE inbox as a route.
//
// The same workspace the bell's "Open inbox" window wraps
// (`features/notifications/components/InboxWorkspace.tsx`): one screen, not two.
// Full-bleed split view under the shell header; the (core) body owns the
// header's height.

import { Suspense } from "react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { InboxPage } from "@/features/notifications/components/InboxPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/notifications", {
  title: "Inbox",
  description: "Every notification, triaged to zero.",
  canonicalPath: "/notifications",
});

export default function NotificationsPage() {
  return (
    <>
      <PageHeader>
        <h1 className="ml-2 text-sm font-medium text-foreground">Inbox</h1>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <Suspense fallback={null}>
          <InboxPage />
        </Suspense>
      </div>
    </>
  );
}
