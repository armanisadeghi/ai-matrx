"use client";

/**
 * HeldWritesOnTable — the SAME approval card, on the table's own page.
 *
 * VERIFIER-26 item 5 (2026-09-26): an agent's write to a moved table was held
 * for approval and nothing anywhere let a person decide it. The chat now draws
 * the card from the tool result; this draws it from the queue, so a person who
 * never saw the conversation — or closed it — decides from the table itself.
 *
 * Absent unless something is waiting: a header control, never a new row on
 * the page ("controls go into existing bars", owner 2026-09-26). It reads the
 * one queue through its own doors — `custom.work_inbox` (what waits on THIS
 * person) and `custom.work_approval_read` (the change itself) — and decides
 * through `custom.work_approval_decide`, exactly as the chat card does,
 * because it IS the chat card.
 */

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";

import { RecordChangeApprovalCard } from "./RecordChangeApprovalCard";
import { waitFromQueueRow, type RecordChangeWait } from "./recordChangeApproval";

interface InboxRow {
  item_id: string;
  kind: string;
  table_id: string | null;
  table_name: string | null;
  actionable: boolean;
}

type Held =
  | { state: "asking" }
  | { state: "none" }
  | { state: "waiting"; waits: RecordChangeWait[]; tableName: string | null }
  | { state: "unreadable"; why: string };

/** Everything held for a person on one table, read from the one queue. */
export async function heldWritesOnTable(
  organizationId: string,
  tableId: string,
): Promise<Held> {
  const { rpc } = recordsDataSource(createClient());
  const inbox = (await rpc(
    "work_inbox",
    {
      p_organization_id: organizationId,
      p_limit: 200,
      p_offset: 0,
      p_include_decided: false,
      p_view: "inbox",
    },
    { schema: "custom" },
  )) as { data?: InboxRow[] | null; error?: { message?: string } | null };
  if (inbox.error) {
    return { state: "unreadable", why: inbox.error.message ?? "The approval queue could not be read." };
  }
  const mine = (inbox.data ?? []).filter(
    (row) =>
      row.table_id === tableId &&
      row.actionable &&
      (row.kind === "proposal" || row.kind === "approval"),
  );
  if (mine.length === 0) return { state: "none" };
  const waits: RecordChangeWait[] = [];
  for (const row of mine.slice(0, 20)) {
    const read = (await rpc(
      "work_approval_read",
      { p_organization_id: organizationId, p_approval_id: row.item_id },
      { schema: "custom" },
    )) as { data?: unknown; error?: unknown };
    if (read.error) continue;
    const wait = waitFromQueueRow(read.data);
    if (wait) waits.push(wait);
  }
  if (waits.length === 0) return { state: "none" };
  return { state: "waiting", waits, tableName: mine[0]?.table_name ?? null };
}

export function HeldWritesOnTable({
  tableId,
  organizationId,
}: {
  tableId: string;
  organizationId: string | null;
}) {
  const [held, setHeld] = useState<Held>({ state: "asking" });
  const [version, setVersion] = useState(0);
  // A decided card keeps its outcome sentence on screen; the list is read again
  // when the person closes it, so the count in the header tells the truth.
  const [decided, setDecided] = useState(false);
  const markDecided = () => setDecided(true);

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void heldWritesOnTable(organizationId, tableId).then(
      (answer) => {
        if (live) setHeld(answer);
      },
      (error: unknown) => {
        if (live) {
          setHeld({
            state: "unreadable",
            why: error instanceof Error ? error.message : "The approval queue could not be read.",
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [organizationId, tableId, version]);

  if (held.state !== "waiting") return null;
  const count = held.waits.length;
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open && decided) {
          setDecided(false);
          setVersion((v) => v + 1);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="held-writes-on-table"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-amber-700 hover:bg-muted dark:text-amber-400"
        >
          <Hourglass className="size-3.5" />
          {count === 1 ? "1 waiting for approval" : `${count} waiting for approval`}
        </button>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="end" className="flex flex-col gap-3 p-3">
        {held.waits.map((wait) => (
          <RecordChangeApprovalCard
            key={wait.approvalId ?? wait.action}
            wait={wait}
            callId={`held-${wait.approvalId}`}
            tableName={held.tableName}
            organizationId={organizationId}
            hideOpen
            onDecided={markDecided}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
