"use client";

/**
 * BoardPage — the Board: a person's own canvas, the platform's main way in.
 * The ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`) with the
 * person's saved board as its canvas; the chat beside it is the shell's, with
 * this board's own conversation (`shellChatHome`). The board publishes its
 * own surface (`matrx-user/board`), so no page-level snapshot is passed.
 *
 * Code splitting: the board (engine + every item type's canonical body) is
 * ONE `ssr: false` edge, rendered only once the saved board is ready.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { LayoutGrid, LayoutTemplate, Pencil, Plus } from "lucide-react";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ErrorNotice } from "@ai-matrx/design-system";
import { TextInputDialog } from "@ai-matrx/design-system";
import { BoardOrganizationProvider } from "../items/board-organization";
import { BoardChatsProvider, BoardHomeChatFiler } from "../items/board-chats";
import { type SavedBoardTarget, useSavedBoard } from "../persistence/useSavedBoard";
import { BOARD_TOKEN } from "../persistence/boardsService";
import type { BoardPreset } from "../presets/board-preset";
import { useCreateBoard } from "../persistence/useCreateBoard";
import { listTemplateIds } from "@/features/spaces/state/templates";
import { toast } from "@/lib/toast";
import { BoardTemplateGallery } from "../templates/BoardTemplateGallery";
import { isBoardTemplate, saveBoardAsTemplate } from "../templates/board-templates";

const OPENING = "Opening your board…";

const UserBoard = dynamic(() => import("./UserBoard").then((m) => m.UserBoard), {
  ssr: false,
  loading: () => <BoardMessage>{<ShimmerText text={OPENING} />}</BoardMessage>,
});

export function BoardPage({
  target,
  workspaceId,
  initialLayout,
  preset,
  titleMenuExtra,
}: {
  target: SavedBoardTarget;
  /** The workspace's remembered layout (the chat's is the shell chat's: `shellChatHome`). */
  workspaceId: string;
  initialLayout: CanvasWorkspaceLayout;
  /** A focus for this board (`presets/`); none = the whole board. */
  preset?: BoardPreset;
  /** Extra items for the board's own title ▾ (a host's boards to switch to). Shown first. */
  titleMenuExtra?: ReactNode;
}) {
  const saved = useSavedBoard(target);
  const [renaming, setRenaming] = useState(false);
  const { creating, newBoard } = useCreateBoard();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The board templates the person can open (null = not read yet): says whether THIS board is one.
  const [templateIds, setTemplateIds] = useState<string[] | null>(null);

  const ready = saved.state === "ready" ? saved : null;
  const title = ready?.board.title ?? "Board";
  const readyId = ready?.board.id ?? null;
  useEffect(() => {
    if (!readyId) return;
    let live = true;
    listTemplateIds("board").then(
      (ids) => live && setTemplateIds(ids),
      () => live && setTemplateIds([]),
    );
    return () => {
      live = false;
    };
  }, [readyId]);
  const isTemplate = readyId ? isBoardTemplate(templateIds, readyId) : false;
  const toggleTemplate = () => {
    if (!readyId) return;
    const on = !isTemplate;
    saveBoardAsTemplate(readyId, on).then(
      () => {
        setTemplateIds((ids) => (on ? [...(ids ?? []), readyId] : (ids ?? []).filter((x) => x !== readyId)));
        toast.success(on ? "Saved as a template" : "Template label removed");
      },
      (e: unknown) => toast.error(e instanceof Error ? e.message : "The template label could not be changed. Try again."),
    );
  };

  const byline = !ready
    ? undefined
    : ready.saveError
      ? `Not saved: ${ready.saveError}`
      : ready.saving
        ? "Saving…"
        : ready.lastSavedAt
          ? "Saved"
          : undefined;

  return (
    <>
      <ChatCanvasWorkspace
        id={workspaceId}
        title={title}
        byline={byline}
        initialLayout={initialLayout}
        // Comments on the whole board ("bigger things"); each rides the next message of this chat.
        record={ready ? { resourceId: ready.board.id, resourceName: title, commentToken: BOARD_TOKEN } : undefined}
        titleMenu={
          <>
            {titleMenuExtra}
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
            <DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="mr-2 h-4 w-4" />
              New board from template…
            </DropdownMenuItem>
            {ready && (
              <DropdownMenuItem onSelect={toggleTemplate}>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {isTemplate ? "Remove template label" : "Save as template"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/board">
                <LayoutGrid className="mr-2 h-4 w-4" />
                Boards
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
                  actions={<Button variant="primary" onClick={saved.retry}>Try again</Button>}
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
                <BoardOrganizationProvider value={ready.board.organizationId}>
                  <BoardChatsProvider key={ready.board.id} boardId={ready.board.id} organizationId={ready.board.organizationId}>
                    <BoardHomeChatFiler />
                    <UserBoard
                      key={ready.board.id}
                      preset={preset}
                      boardId={ready.board.id}
                      title={ready.board.title}
                      doc={ready.board.doc}
                      viewerCamera={ready.board.viewerCamera}
                      onChange={ready.save}
                      onCamera={ready.saveCamera}
                    />
                  </BoardChatsProvider>
                </BoardOrganizationProvider>
              </>
            )}
          </div>
        }
      />
      <BoardTemplateGallery open={templatesOpen} onOpenChange={setTemplatesOpen} initialKey={preset && typeof preset.starter === "string" ? preset.starter : undefined} />
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
