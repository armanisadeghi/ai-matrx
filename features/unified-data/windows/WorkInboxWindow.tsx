"use client";

/**
 * What waits on you in your tables, as a window — the record store's own
 * `ActionInbox` (`@ai-matrx/records-ui`), the same component `/data` mounts,
 * across EVERY organization of the person (`organizationId: null` — the store's
 * doors answer for the person; never the active organization).
 *
 * Its own Waiting / Snoozed / Cleared views and `z` undo come with it, so an item
 * a person snoozed in a table is one click from the bell (notifications ruling 3,
 * 2026-10-01). Opening a record goes to a NEW TAB: a window opened over a page
 * never moves that page.
 *
 * Rendered only behind the lazy overlay boundary (`OverlayController`).
 */

import Link from "next/link";
import { ActionInbox, RecordsMount } from "@ai-matrx/records-ui";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { openPath } from "@/lib/deep-link/openPath";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

function openRecordInNewTab(recordId: string, tableId: string) {
  const href = openPath(recordId, { fallback: `/data/${tableId}?record=${recordId}` });
  window.open(new URL(href, window.location.origin).toString(), "_blank", "noopener,noreferrer");
}

export function WorkInboxWindow({ onClose }: { onClose?: () => void }) {
  const userId = useAppSelector(selectUserId);
  const recordsConfig = useAppRecordsConfig(null);
  return (
    <WindowPanel
      id="work-inbox-window"
      overlayId="workInboxWindow"
      title="In your tables"
      width={720}
      height={560}
      minWidth={360}
      minHeight={280}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {userId ? (
          <RecordsMount
            letTheStoreDecideRights
            config={recordsConfig}
            host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
          >
            <ActionInbox onOpenRecord={openRecordInNewTab} />
          </RecordsMount>
        ) : (
          <OrganizationContextNotice state="resolving" what="Your tables" />
        )}
      </div>
    </WindowPanel>
  );
}

export default WorkInboxWindow;
