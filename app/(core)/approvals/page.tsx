// /approvals — THE approval queue as a route (human-in-the-loop policy rule 5).
//
// The same surface the approvals window shows; both mount
// `features/approvals/ApprovalsWorkspace.tsx`, so there is one screen, not two.
//
// Body reserves the header's height (`pt-[var(--shell-header-h)]`) per the
// (core) route rules — a page that skips it draws its first row inside the
// header band, where every click is swallowed.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { ApprovalsWorkspace } from "@/features/approvals/ApprovalsWorkspace";

export default async function ApprovalsPage({
  searchParams,
}: {
  // `?item=<assist id>` — where the assist chip handler and every deep link
  // land. Read here, in the server component, so the client surface needs no
  // `useSearchParams` (and so the window, which has no URL, passes nothing).
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const { item } = await searchParams;
  const focusItemId = Array.isArray(item) ? (item[0] ?? null) : (item ?? null);
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-medium text-foreground">Waiting on you</h1>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
          <ApprovalsWorkspace focusItemId={focusItemId} />
        </div>
      </div>
    </>
  );
}
