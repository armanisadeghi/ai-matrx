// /notifications — THE inbox as a route.
//
// The same surface the header bell shows; both mount
// `features/notifications/components/InboxPanel.tsx`, so there is one screen,
// not two. Body reserves the header's height per the (core) route rules.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { InboxPanel } from "@/features/notifications/components/InboxPanel";

export default function NotificationsPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-medium text-foreground">Inbox</h1>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4 md:p-6">
          <InboxPanel
            variant="page"
            className="min-h-0 flex-1 rounded-xl border border-border bg-background"
          />
        </div>
      </div>
    </>
  );
}
