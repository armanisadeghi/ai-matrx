import PageHeader from "@/features/shell/components/header/PageHeader";
import { PanelControlProvider } from "@/app/(ssr)/ssr/demos/resizables/_lib/PanelControlProvider";
import { readLayoutCookie } from "@/app/(ssr)/ssr/demos/resizables/_lib/readLayoutCookie";
import { TasksHeaderControls } from "@/features/tasks/components/TasksHeaderControls";
import { TasksDesktopShell } from "@/features/tasks/components/TasksDesktopShell";
import { TaskUrlSync } from "@/features/tasks/components/TaskUrlSync";

const COOKIE_NAME = "panels:tasks:v2";

/**
 * /tasks — Server Component shell mirroring `app/(a)/agents/[id]/build`:
 *  - Reads the panel layout cookie on the server so the first paint already
 *    has the user's saved column widths.
 *  - Portals title + toggle buttons into the shell's glass header via
 *    <PageHeader/>. No body-level header — the page reclaims that vertical
 *    space and content extends behind the transparent shell header.
 *  - Wraps everything in <PanelControlProvider/> so the header buttons in
 *    the portaled subtree can drive panel collapse via React Context (which
 *    propagates through the React tree, not the DOM tree).
 *  - Hands all mobile/desktop branching + per-panel mounting to a single
 *    client island, <TasksDesktopShell/>.
 */
export default async function TasksPage() {
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
