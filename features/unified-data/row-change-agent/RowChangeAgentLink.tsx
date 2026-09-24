"use client";

/**
 * "WHEN A ROW CHANGES, RUN AN AGENT…" ON THE NEW TABLE PAGE (TABLE-PARITY N2, lane GRID-TAILS).
 *
 * The older grid offers this from its Actions column menu: it opens the schedule form with the
 * "table change" trigger set to this table, and the schedule runs the person's agent whenever a
 * row is added, changed, archived or restored. The default grid on /data-v2 offered nothing.
 *
 * 🚨 ABSENT UNTIL IT CAN FIRE. A record-store row change reaches the scheduler only once G8 is on
 * the database, and `custom.record_change_actions` (lane GRID-PORT) arrives with it — so the door
 * answering IS the signal. Before that, a schedule made here would never run, and a link that
 * makes one would be a control that lies; so nothing is drawn (the same rule, the same door, as
 * `rowChangeScheduleFor` in the older grid). A refusal other than "not on this database" is said.
 *
 * Automations are schedules (Arman, 2026-09-22: plug into what the system already does), so this
 * is a link into the one schedule form, not a second automation builder.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";

import { recordChangeActions } from "@/features/data-tables/data-source/record-store-grid";

type Answer =
  | { state: "asking" }
  | { state: "absent" }
  | { state: "refused"; why: string }
  | { state: "offered"; entityType: string };

/**
 * WHETHER THIS TABLE OFFERS "WHEN A ROW CHANGES, RUN AN AGENT", AND WHERE IT GOES — the one
 * answer the link below and the table's own menu both draw from (lane DATA-V2-FACE: the table
 * page carries it in its one menu, not on a row of its own). Absent until the store says a row
 * change here reaches a schedule; a refusal is returned to be SAID, never dropped.
 */
export type RowChangeAgentOffer =
  | { state: "asking" }
  | { state: "absent" }
  | { state: "refused"; why: string }
  | { state: "offered"; href: string };

export function useRowChangeAgentOffer({
  tableId,
  tableName,
  organizationId,
  userId,
}: {
  tableId: string;
  tableName: string | null;
  organizationId: string | null;
  userId: string | null;
}): RowChangeAgentOffer {
  const [answer, setAnswer] = useState<Answer>({ state: "asking" });

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void recordChangeActions({ store: "record", organizationId, userId }, tableId).then((door) => {
      if (!live) return;
      if (door.ok) setAnswer({ state: "offered", entityType: door.data.entity_type });
      else if (door.absent) setAnswer({ state: "absent" });
      else setAnswer({ state: "refused", why: door.error.message });
    });
    return () => {
      live = false;
    };
  }, [tableId, organizationId, userId]);

  if (answer.state !== "offered") return answer;
  const prompt = `${tableName ? `A row in the table "${tableName}"` : "A row in this table"} changed. The event variable names the row and the columns that changed. `;
  return {
    state: "offered",
    href: `/schedules/new?trigger=event&tableId=${encodeURIComponent(tableId)}&entityType=${encodeURIComponent(answer.entityType)}&prompt=${encodeURIComponent(prompt)}`,
  };
}

/** The words the offer carries, wherever it is drawn. */
export const ROW_CHANGE_AGENT_LABEL = "When a row changes, run an agent…";

export function RowChangeAgentLink({
  tableId,
  tableName,
  organizationId,
  userId,
}: {
  tableId: string;
  tableName: string | null;
  organizationId: string;
  userId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const offer = useRowChangeAgentOffer({ tableId, tableName, organizationId, userId });

  if (offer.state === "asking" || offer.state === "absent") return null;
  if (offer.state === "refused") {
    return <span className="text-destructive">Running an agent when a row changes is not available: {offer.why}</span>;
  }
  return (
    <button
      type="button"
      data-row-change-agent=""
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground hover:bg-muted disabled:opacity-60"
      disabled={pending}
      onClick={() => {
        if (pending) return;
        startTransition(() => router.push(offer.href));
      }}
    >
      <Zap className="h-3 w-3" />
      {pending ? "Opening schedule…" : ROW_CHANGE_AGENT_LABEL}
    </button>
  );
}
