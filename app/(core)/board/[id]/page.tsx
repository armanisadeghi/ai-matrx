// /board/<id> — one of the person's boards. Mechanics: features/spatial/FEATURE.md.

import { readCanvasWorkspaceLayout } from "@/features/canvas/workspace/workspace-cookies.server";
import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { BoardPage } from "@/features/spatial/home/BoardPage";

export default async function SavedBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = `board-${id}`;
  const [initialLayout, initialMode] = await Promise.all([
    readCanvasWorkspaceLayout(workspaceId),
    readComposerModeCookie(),
  ]);
  return (
    <div className="h-full min-h-0">
      <BoardPage
        target={{ boardId: id }}
        workspaceId={workspaceId}
        initialLayout={initialLayout}
        initialMode={initialMode}
      />
    </div>
  );
}
