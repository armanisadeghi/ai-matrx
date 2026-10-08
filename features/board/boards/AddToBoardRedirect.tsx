"use client";

// features/board/boards/AddToBoardRedirect.tsx
//
// `/board?add=<item key>` — the menu's "Add to your board" rows. There is no special home
// board: the item starts on the board the person opened last (`getLastOpenedBoardId`), or on a
// new board when they have none. This only resolves that board and moves on to
// `/board/<id>?add=<key>`, where UserBoard starts the item (its `addKey` effect).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { beginBoardCreate, getLastOpenedBoardId, isBoardError } from "../persistence/boardsService";

/** Where an add lands: the board it opens on, carrying the item key. Exported for tests. */
export function addToBoardHref(boardId: string, addKey: string): string {
  return `/board/${boardId}?add=${encodeURIComponent(addKey)}`;
}

export function AddToBoardRedirect({ addKey }: { addKey: string }) {
  const router = useRouter();
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !userId) return;
    const run = `${userId}|${addKey}|${attempt}`;
    if (started.current === run) return;
    started.current = run;
    void (async () => {
      try {
        const last = await getLastOpenedBoardId();
        const id = last ?? (await beginBoardCreate({ organizationId })).id;
        router.replace(addToBoardHref(id, addKey));
      } catch (error) {
        setFailure(isBoardError(error) ? error.message : error instanceof Error ? error.message : "Your board could not be opened.");
      }
    })();
  }, [authReady, userId, addKey, attempt, organizationId, router]);

  if (failure) {
    return (
      <div className="flex min-h-40 items-center justify-center p-6">
        <ErrorNotice
          className="max-w-md"
          title="Your board could not be opened"
          message={failure}
          operation="Open board"
          calls={["boards"]}
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setFailure(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-40 items-center justify-center p-6" role="status">
      <ShimmerText text="Opening your board…" />
    </div>
  );
}
