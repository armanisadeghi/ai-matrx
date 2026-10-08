"use client";

// features/board/persistence/useCreateBoard.ts
//
// The ONE way a person makes a new board: create it in the selected
// organization (the gate asks when none is selected), then OPEN it. The board
// title menu on /board and "New board" on /board/all both use this, so neither
// can create a board without opening it, and a second click while one is being
// made is ignored (it used to spawn "Untitled board" duplicates).

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { beginBoardCreate, isBoardError } from "./boardsService";

/**
 * The route change can take a while (a cold route compiles, a background tab throttles): the hook
 * stays busy until the page is actually at the new board, never for a fixed moment. This is the
 * longest it waits before it gives up and hands the person an "Open" action instead.
 */
const OPEN_GIVE_UP_MS = 30_000;

export function useCreateBoard(): { creating: boolean; newBoard: () => Promise<void> } {
  const router = useRouter();
  const pathname = usePathname();
  const organizationId = useAppSelector(selectOrganizationId);
  const [creating, setCreating] = useState(false);
  // The id of a board that was made and is on its way to opening: while set, "New board" stays
  // disabled and ignores clicks, so a slow route change never invites a second, empty board.
  const [opening, setOpening] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (opening === null) return;
    if (pathname === `/board/${opening}`) {
      busy.current = false;
      setOpening(null);
      return;
    }
    const giveUp = setTimeout(() => {
      busy.current = false;
      setOpening(null);
      toast.warning("Your new board is ready", {
        description: "It is taking longer than usual to open.",
        action: { label: "Open", onClick: () => router.push(`/board/${opening}`) },
      });
    }, OPEN_GIVE_UP_MS);
    return () => clearTimeout(giveUp);
  }, [opening, pathname, router]);

  const newBoard = async () => {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    let stayBusy = false;
    try {
      // Optimistic: the id is minted here and the page opens at once; the insert lands behind it
      // (a failed insert is reported on that page with Retry). Held for the organization gate when
      // none is selected: the person picks, THIS request proceeds once and opens the new board.
      const { id } = await beginBoardCreate({ organizationId });
      router.push(`/board/${id}`);
      stayBusy = true;
      setOpening(id);
    } catch (error) {
      toast.error(
          isBoardError(error)
            ? error.message
            : `The board could not be created: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      setCreating(false);
      if (!stayBusy) busy.current = false;
    }
  };

  return { creating: creating || opening !== null, newBoard };
}
