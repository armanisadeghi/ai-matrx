"use client";

/**
 * BoardPage — the Board: a person's own canvas, the platform's main way in.
 * The ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`) with the
 * person's saved board as its canvas. The board publishes its own surface
 * (`matrx-user/board`), so no page-level snapshot is passed.
 *
 * Code splitting: the board (engine + every item type's canonical body) is
 * ONE `ssr: false` edge, rendered only once the saved board is ready.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { LayoutGrid, Pencil, Plus } from "lucide-react";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import type { ComposerMode } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/composer-types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { type SavedBoardTarget, useSavedBoard } from "../persistence/useSavedBoard";
import { BOARD_TOKEN } from "../persistence/boardsService";
import { useCreateBoard } from "../persistence/useCreateBoard";

const OPENING = "Opening your board…";

const UserBoard = dynamic(() => import("./UserBoard").then((m) => m.UserBoard), {
  ssr: false,
  loading: () => <BoardMessage>{<ShimmerText text={OPENING} />}</BoardMessage>,
});

export function BoardPage({
  target,
  workspaceId,
  initialLayout,
  initialMode,
}: {
  target: SavedBoardTarget;
  /** Cookies + the chat's surface key. */
  workspaceId: string;
  initialLayout: CanvasWorkspaceLayout;
  initialMode: ComposerMode | null;
}) {
  const saved = useSavedBoard(target);
  const [renaming, setRenaming] = useState(false);
  const { creating, newBoard } = useCreateBoard();

  const ready = saved.state === "ready" ? saved : null;
  const title = ready?.board.title ?? "Board";

  const byline = !ready
    ? undefined
    : ready.saveError
      ? `Not saved: ${ready.saveError}`
      : ready.saving
        ? "Saving…"
        : ready.lastSavedAt
          ? "Saved"
          : ready.board.isHome
            ? "Your board"
            : undefined;

  return (
    <>
      <ChatCanvasWorkspace
        id={workspaceId}
        title={title}
        byline={byline}
        initialLayout={initialLayout}
        initialMode={initialMode}
        // Comments on the whole board ("bigger things"); each rides the next message of this chat.
        record={ready ? { resourceId: ready.board.id, resourceName: title, commentToken: BOARD_TOKEN } : undefined}
        titleMenu={
          <>
            {ready && (
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={creating} onSelect={() => void newBoard()}>
              <Plus className="mr-2 h-4 w-4" />
              New board
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/board/all">
                <LayoutGrid className="mr-2 h-4 w-4" />
                All boards
              </Link>
            </DropdownMenuItem>
          </>
        }
        canvas={
          <div className="relative h-full min-h-0">
            {saved.state === "loading" && (
              <BoardMessage>
                <ShimmerText text={OPENING} />
              </BoardMessage>
            )}
            {saved.state === "failed" && (
              <BoardMessage>
                <ErrorNotice
                  className="max-w-md"
                  title="Your board could not be opened"
                  message={saved.reason}
                  operation="Open board"
                  calls={["boards"]}
                  actions={<Button onClick={saved.retry}>Try again</Button>}
                />
              </BoardMessage>
            )}
            {ready && (
              <>
                {ready.board.problems.length > 0 && (
                  <ErrorNotice
                    size="compact"
                    className="absolute bottom-16 left-4 z-40 max-w-md"
                    title="Parts of this board could not be read"
                    message={`They were left out: ${ready.board.problems.join("; ")}`}
                    operation="Read board"
                    details={{ problems: ready.board.problems }}
                  />
                )}
                <UserBoard
                  key={ready.board.id}
                  boardId={ready.board.id}
                  title={ready.board.title}
                  doc={ready.board.doc}
                  viewerCamera={ready.board.viewerCamera}
                  onChange={ready.save}
                  onCamera={ready.saveCamera}
                />
              </>
            )}
          </div>
        }
      />
      {ready && (
        <TextInputDialog
          open={renaming}
          onOpenChange={setRenaming}
          title="Rename board"
          defaultValue={ready.board.title}
          confirmLabel="Rename"
          onConfirm={(value) => {
            ready.rename(value);
            setRenaming(false);
          }}
        />
      )}
    </>
  );
}

function BoardMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">{children}</div>;
}
