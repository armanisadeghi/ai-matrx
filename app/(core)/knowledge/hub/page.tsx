/**
 * `/knowledge` — the Knowledge hub (KNOWLEDGE-HUB §5.2, phase H3): one place to
 * keep, organize and search everything. Guests get the Knowledge landing; the
 * system showcase moved to `/knowledge/about`.
 *
 * Server Component: reads the panel-layout cookie so the first paint already
 * has the person's pane widths (react-resizable-panels v4 cookie pattern).
 */

import { Suspense } from "react";
import { PanelControlProvider } from "@/features/resizable-panels/PanelControlProvider";
import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import { KnowledgeHubPage } from "@/features/knowledge/hub/components/KnowledgeHubPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

const COOKIE_NAME = "panels:knowledge-hub:v1";

export default async function KnowledgeHubRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);
  return (
    <PanelControlProvider initialLayouts={[defaultLayout]}>
      <div className="h-full overflow-hidden">
        <Suspense fallback={null}>
          <KnowledgeHubPage defaultLayout={defaultLayout} cookieName={COOKIE_NAME} />
        </Suspense>
      </div>
    </PanelControlProvider>
  );
}
