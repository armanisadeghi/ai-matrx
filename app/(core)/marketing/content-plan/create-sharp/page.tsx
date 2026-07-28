/**
 * app/(core)/marketing/content-plan/create-sharp/page.tsx
 *
 * "Site shape" — the fast path from nothing (or a half-built site) to a
 * structured plan. A peer view of the content-plan workspace, not a
 * replacement: the tree, map and entity views are untouched and this route
 * links straight back into them.
 *
 * Server component: auth branches here, route chrome injects into the shell
 * PageHeader, and the body is the client workbench at full height per
 * (core) doctrine.
 */
import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { CreateSharpHeader } from "./_components/CreateSharpHeader";
import { ShapeWorkbench } from "./_components/ShapeWorkbench";

export default async function ContentPlanCreateSharpPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan/create-sharp");
  }

  return (
    <>
      <PageHeader>
        <CreateSharpHeader />
      </PageHeader>
      {/* Both panes carry static top UI (the rail's section head, the pane's
          tab row), so the whole surface starts BELOW the glass header rather
          than scrolling behind it — the panels pattern in
          features/shell/components/header/variants/USAGE.md. */}
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <ShapeWorkbench />
      </div>
    </>
  );
}
