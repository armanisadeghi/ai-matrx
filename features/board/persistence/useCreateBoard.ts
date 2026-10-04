"use client";

// features/board/persistence/useCreateBoard.ts
//
// The ONE way a person makes a new board: create it in the selected
// organization (the gate asks when none is selected), then OPEN it. The board
// title menu on /board and "New board" on /board/all both use this, so neither
// can create a board without opening it, and a second click while one is being
// made is ignored (it used to spawn "Untitled board" duplicates).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import { beginBoardCreate, isBoardError } from "./boardsService";

const BUSY_AFTER_OPEN_MS = 2000;

export function useCreateBoard(): { creating: boolean; newBoard: () => Promise<void> } {
  const router = useRouter();
  const organizationId = useAppSelector(selectOrganizationId);
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);

  const newBoard = async () => {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    let stayBusy = false;
    try {
      // Optimistic: the id is minted here and the page opens at once; the insert lands behind it
      // (a failed insert is reported on that page with Retry). Stay busy while the route changes so
      // a double click still makes ONE board.
      const { id } = await beginBoardCreate({ organizationId });
      router.push(`/board/${id}`);
      stayBusy = true;
    } catch (error) {
      if (!isOrganizationSelectionCancelled(error)) {
        toast.error(
          isBoardError(error)
            ? error.message
            : `The board could not be created: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      setCreating(false);
      if (stayBusy) setTimeout(() => (busy.current = false), BUSY_AFTER_OPEN_MS);
      else busy.current = false;
    }
  };

  return { creating, newBoard };
}
