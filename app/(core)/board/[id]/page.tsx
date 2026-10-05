// /board/<id> — one of the person's boards. Mechanics: features/board/FEATURE.md.

import { readCanvasWorkspaceLayout } from "@ai-matrx/chat/next/server/workspace-cookies.server";
import { BoardPage } from "@/features/board/home/BoardPage";

export default async function SavedBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = `board-${id}`;
  const initialLayout = await readCanvasWorkspaceLayout(workspaceId);
  return (
    <div className="h-full min-h-0">
      <BoardPage
        target={{ boardId: id }}
        workspaceId={workspaceId}
        initialLayout={initialLayout}
      />
    </div>
  );
}
