"use client";

// features/spatial/boards/BoardsListPage.tsx
//
// /board/all — every board you made, on the canonical list shell. "New board"
// creates one in the selected organization (the gate asks when none is
// selected) and opens it.

import { Loader2, Plus } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useCreateBoard } from "../persistence/useCreateBoard";
import { boardListConfig } from "./listConfig";

export function BoardsListPage() {
  const { creating, newBoard } = useCreateBoard();
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const mayLoad = Boolean(authReady && userId && accessToken);

  const newButton = (
    <ControlButton variant="primary" onClick={() => void newBoard()} disabled={creating}>
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      <span className="max-sm:sr-only">New board</span>
    </ControlButton>
  );

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">Boards</h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Open spaces for your chats, notes, files and tasks
          </span>
        </div>
      </PageHeader>
      {mayLoad ? (
        <EntityListPage config={boardListConfig} headerActions={newButton} emptyAction={newButton} />
      ) : (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing you in…
        </div>
      )}
    </>
  );
}
