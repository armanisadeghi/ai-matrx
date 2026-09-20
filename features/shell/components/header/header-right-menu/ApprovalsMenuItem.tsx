"use client";

/**
 * "Waiting on you" in the user menu, with the count of pending AI proposals
 * addressed to this person, opening THE approval queue in its window.
 *
 * Same shape as `MessagesMenuItem` (the unread badge next to a menu label) —
 * one pattern for "there are N things for you", not a second one. The badge is
 * absent at 0 and absent when the count could not be read: a grey zero and a
 * confident wrong number are both lies.
 */

import { useCallback } from "react";
import { ClipboardCheck } from "lucide-react";
import { usePendingApprovalCount } from "@/features/approvals/usePendingApprovalCount";
import { useOpenApprovalsWindow } from "@/features/overlays/openers/approvalsWindow";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { useMenuCheckboxId } from "./menuCheckboxId";

export function ApprovalsMenuItem() {
  const openApprovals = useOpenApprovalsWindow();
  const menuCheckboxId = useMenuCheckboxId();
  const { count, unknown } = usePendingApprovalCount();

  const handleClick = useCallback(() => {
    openApprovals();
  }, [openApprovals]);

  return (
    <label htmlFor={menuCheckboxId} className="block">
      <button className={MENU_ITEM_CLASS} onClick={handleClick}>
        <ClipboardCheck />
        <span className="flex-1 text-left">Waiting on you</span>
        {!unknown && count > 0 ? (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </label>
  );
}

export default ApprovalsMenuItem;
