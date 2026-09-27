// /board — the person's own board (their home board in the active
// organization): the platform's main way in. Mechanics: features/spatial/FEATURE.md.

import { readCanvasNavCookie } from "@/features/shell/canvas-chrome/canvas-nav.server";
import { readCanvasChatCookie } from "@/features/canvas/workspace/workspace-cookies.server";
import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { BoardPage } from "@/features/spatial/home/BoardPage";

/** The workspace id of the home board (its chat surface key and cookies). */
const WORKSPACE_ID = "board-home";

export default async function HomeBoardPage() {
  const [initialNav, initialChat, initialMode] = await Promise.all([
    readCanvasNavCookie(),
    readCanvasChatCookie(WORKSPACE_ID),
    readComposerModeCookie(),
  ]);
  return (
    <div className="h-full min-h-0">
      <BoardPage
        target={{ home: true }}
        workspaceId={WORKSPACE_ID}
        initialNav={initialNav}
        initialChat={initialChat}
        initialMode={initialMode}
      />
    </div>
  );
}
