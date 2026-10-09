"use client";

// features/board/boards/BoardsListPage.tsx
//
// /board — every board you made, on the canonical list shell. "New board"
// creates one in the selected organization (the gate asks when none is
// selected) and opens it.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutTemplate, Loader2, Plus } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useCreateBoard } from "../persistence/useCreateBoard";
import { AddToBoardRedirect } from "./AddToBoardRedirect";
import { boardListConfig } from "./listConfig";
import { BoardTemplateGallery } from "../templates/BoardTemplateGallery";

/** `/board?add=<key>` is an add, not a list: it opens the last-opened board and starts the item. */
export function BoardsListPage() {
  return (
    <Suspense fallback={null}>
      <BoardsRoute />
    </Suspense>
  );
}

function BoardsRoute() {
  const addKey = useSearchParams().get("add");
  return addKey ? <AddToBoardRedirect addKey={addKey} /> : <BoardsList />;
}

function BoardsList() {
  const { creating, newBoard } = useCreateBoard();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const mayLoad = Boolean(authReady && userId && accessToken);

  const newButton = (
    <ControlButton variant="primary" onClick={() => void newBoard()} disabled={creating} icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} collapse="container">
      New board
    </ControlButton>
  );
  const templatesButton = (
    <ControlButton variant="outline" onClick={() => setTemplatesOpen(true)} icon={<LayoutTemplate className="h-4 w-4" />} collapse="container">
      From a template
    </ControlButton>
  );
  const actions = (
    <>
      {templatesButton}
      {newButton}
    </>
  );

  return (
    <>
      <RecordPageHeader record={{ name: "Boards" }} />
      {mayLoad ? (
        <EntityListPage config={boardListConfig} headerActions={actions} emptyAction={actions} />
      ) : (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing you in…
        </div>
      )}
      <BoardTemplateGallery open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </>
  );
}
