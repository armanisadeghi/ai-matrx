// app/(core)/tasks/page.tsx
//
// Server Component page. Auth branch happens server-side via `getServerAuth()`
// (request-scoped cache — see `utils/supabase/getServerAuth.ts`). Guests are
// served the full `<TasksLanding />` directly with zero workspace code shipped;
// authed users get the workspace shell with zero marketing code shipped.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PanelControlProvider } from "@/app/(ssr)/demos/ssr/resizables/_lib/PanelControlProvider";
import { readLayoutCookie } from "@/app/(ssr)/demos/ssr/resizables/_lib/readLayoutCookie";
import { TasksHeaderControls } from "@/features/tasks/components/TasksHeaderControls";
import { TasksDesktopShell } from "@/features/tasks/components/TasksDesktopShell";
import { TaskUrlSync } from "@/features/tasks/components/TaskUrlSync";
import TasksLanding from "@/features/auth/components/module-landing/landings/TasksLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

const COOKIE_NAME = "panels:tasks:v2";

export default async function TasksPage() {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    return <TasksLanding />;
  }

  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <PanelControlProvider>
      <PageHeader>
        <TasksHeaderControls />
      </PageHeader>
      <TaskUrlSync />
      <div className="h-full overflow-hidden">
        <TasksDesktopShell
          defaultLayout={defaultLayout}
          cookieName={COOKIE_NAME}
        />
      </div>
    </PanelControlProvider>
  );
}
