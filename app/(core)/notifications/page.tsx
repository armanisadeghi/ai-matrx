// /notifications — THE inbox as a route.
//
// The same workspace the bell's "Open inbox" window wraps
// (`features/notifications/components/InboxWorkspace.tsx`): one screen, not two.
// Full-bleed split view under the shell header; the (core) body owns the
// header's height.

import { Suspense } from "react";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
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
      <RecordPageHeader record={{ name: "Inbox" }} />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <Suspense fallback={null}>
          <InboxPage />
        </Suspense>
      </div>
    </>
  );
}
