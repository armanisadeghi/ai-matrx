"use client";

// features/spatial/boards/BoardsListPage.tsx
//
// /board/all — every board you made, on the canonical list shell. "New board"
// creates one in the selected organization (the gate asks when none is
// selected) and opens it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import { boardHref, createBoard, isBoardError } from "../persistence/boardsService";
import { boardListConfig } from "./listConfig";

export function BoardsListPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const organizationId = useAppSelector(selectOrganizationId);
  const mayLoad = Boolean(authReady && userId && accessToken);

  const newBoard = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const board = await createBoard({ organizationId });
      startTransition(() => router.push(boardHref(board)));
    } catch (error) {
      if (!isOrganizationSelectionCancelled(error)) {
        toast.error(
          isBoardError(error)
            ? error.message
            : `The board could not be created: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      setCreating(false);
    }
  };

  const newButton = (
    <Button size="sm" className="h-11 lg:h-7" onClick={() => void newBoard()} disabled={creating}>
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      <span className="max-sm:sr-only">New board</span>
    </Button>
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
