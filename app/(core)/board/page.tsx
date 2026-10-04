// /board — the person's own board (their home board in the active
// organization): the platform's main way in. Mechanics: features/board/FEATURE.md.

import { readCanvasWorkspaceLayout } from "@ai-matrx/chat/next/server/workspace-cookies.server";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import { BoardPage } from "@/features/board/home/BoardPage";

/** The workspace id of the home board (its chat surface key and cookies). */
const WORKSPACE_ID = "board-home";

export default async function HomeBoardPage() {
  const [initialLayout, initialMode] = await Promise.all([
    readCanvasWorkspaceLayout(WORKSPACE_ID),
    readComposerModeCookie(),
  ]);
  return (
    <div className="h-full min-h-0">
      <BoardPage
        target={{ home: true }}
        workspaceId={WORKSPACE_ID}
        initialLayout={initialLayout}
        initialMode={initialMode}
      />
    </div>
  );
}
