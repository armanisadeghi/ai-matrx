"use client";

// features/data-tables/pick-lists/components/PickListWindowBody.tsx — WHAT A PICK LIST WINDOW SHOWS (lane
// OLD-READERS-REMOVAL, 2026-10-01). The pick list window (`pickListManagerWindow`; its v1
// twin retired 2026-10-02) used to mount the two older list managers. Every list lives in the record store now:
// with a list named, the window is that list's table page (the screen /pick-lists/<id> is); without one,
// it is the Pick lists index (the screen /pick-lists is), each row opening the list's page.

import { useState } from "react";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import { LIST_PAGE_LINE } from "../list-page-line";
import { PickListsIndex } from "./PickListsIndex";

export function PickListWindowBody({ forcedListId }: { forcedListId?: string | null }) {
  const userId = useAppSelector(selectUserId);
  const organizationName = useAppSelector(selectOrganizationName);
  const [dataSource] = useState(() => recordsDataSource(createClient()));

  if (forcedListId) {
    // Inside a window there is no shell header above the page.
    return (
      <div className="flex h-full flex-col [--shell-header-h:0px]">
        <p className="shrink-0 px-4 pb-1 pt-1 text-xs text-muted-foreground" data-testid="list-page-line">
          {LIST_PAGE_LINE}
        </p>
        <div className="min-h-0 flex-1">
          <UnifiedDataTablePage tableId={forcedListId} />
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-3">
      {userId ? (
        <PickListsIndex organizationName={organizationName ?? null} userId={userId} dataSource={dataSource} />
      ) : null}
    </div>
  );
}
