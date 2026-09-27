"use client";

/**
 * BoardPage — the Board: a person's own canvas, the platform's main way in.
 * The ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`) with the
 * person's saved board as its canvas. The board publishes its own surface
 * (`matrx-user/spatial-board`), so no page-level snapshot is passed.
 *
 * Code splitting: the board (engine + every item type's canonical body) is
 * ONE `ssr: false` edge, rendered only once the saved board is ready.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { LayoutGrid, Pencil, Plus } from "lucide-react";
import { ChatCanvasWorkspace } from "@/features/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasNavPersisted } from "@/features/shell/canvas-chrome/canvas-nav-cookie";
import type { CanvasChatPlacement } from "@/features/canvas/workspace/workspace-cookies";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { type SavedBoardTarget, useSavedBoard } from "../persistence/useSavedBoard";
import { boardHref, createBoard } from "../persistence/boardsService";

const OPENING = "Opening your board…";

const UserBoard = dynamic(() => import("./UserBoard").then((m) => m.UserBoard), {
  ssr: false,
  loading: () => <BoardMessage>{<ShimmerText text={OPENING} />}</BoardMessage>,
});

export function BoardPage({
  target,
  workspaceId,
  initialNav,
  initialChat,
  initialMode,
}: {
  target: SavedBoardTarget;
  /** Cookies + the chat's surface key. */
  workspaceId: string;
  initialNav: CanvasNavPersisted;
  initialChat: CanvasChatPlacement;
  initialMode: ComposerMode | null;
}) {
  const saved = useSavedBoard(target);
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [creating, startCreating] = useTransition();
  const activeOrgId = useAppSelector(selectOrganizationId);

  const ready = saved.state === "ready" ? saved : null;
  const title = ready?.board.title ?? "Board";

  const newBoard = () =>
    startCreating(async () => {
      try {
        const board = await createBoard({ organizationId: activeOrgId });
        router.push(boardHref(board));
      } catch (err) {
        toast.error(`A new board could not be created: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

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
        initialNav={initialNav}
        initialChat={initialChat}
        initialMode={initialMode}
        titleMenu={
          <>
            {ready && (
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={creating} onSelect={newBoard}>
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
                  calls={["spatial_boards"]}
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
                <UserBoard key={ready.board.id} title={ready.board.title} doc={ready.board.doc} onChange={ready.save} />
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
