"use client";

// features/crm/components/outreach-lists/OutreachListPicker.tsx
//
// "Which outreach list does this go into?" — extracted from
// `AddToOutreachListDialog` when the G9 outreach doors (a reputation case, a
// backlink prospect) needed the SAME question asked the same way. One picker,
// three callers; a second copy would have drifted on ranking, the inline
// create, and the org the new list is born into.
//
// The hook owns loading + selection + inline creation; the fields component is
// purely presentational. Callers do the enrolling, because what they enroll
// (a selection, a folded outlet) is the part that legitimately differs.

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  createOutreachList,
  fetchOutreachLists,
} from "../../outreach-lists/service";
import type {
  OutreachListKind,
  OutreachListWithCount,
} from "../../outreach-lists/types";
import { ListKindBadge, ListStatusBadge } from "./badges";

export interface OutreachListChoice {
  lists: OutreachListWithCount[] | null;
  chosenId: string | null;
  setChosenId: (id: string) => void;
  creating: boolean;
  setCreating: (creating: boolean) => void;
  newName: string;
  setNewName: (name: string) => void;
  /** True when the caller has enough to enroll into something. */
  ready: boolean;
  /**
   * Resolve the chosen (or freshly created) list. Throws with a human reason
   * rather than returning null — a caller that cannot name a list must stop.
   */
  resolve: (args: {
    orgId: string | null | undefined;
    kind: OutreachListKind;
  }) => Promise<OutreachListWithCount>;
}

/** Working lists first; archived stay reachable but sink. */
function rank(status: string): number {
  return status === "active"
    ? 0
    : status === "draft"
      ? 1
      : status === "paused"
        ? 2
        : 3;
}

export function useOutreachListChoice(open: boolean): OutreachListChoice {
  const ctx = useCrmContext();
  const [lists, setLists] = useState<OutreachListWithCount[] | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open || !ctx) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchOutreachLists(ctx);
        if (cancelled) return;
        const ranked = [...rows].sort(
          (a, b) => rank(a.status) - rank(b.status),
        );
        setLists(ranked);
        setChosenId((prev) => prev ?? ranked[0]?.id ?? null);
        if (ranked.length === 0) setCreating(true);
      } catch (e) {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Failed to load outreach lists",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ctx]);

  const ready = creating ? newName.trim().length > 0 : Boolean(chosenId);

  const resolve: OutreachListChoice["resolve"] = async ({ orgId, kind }) => {
    if (creating) {
      const name = newName.trim();
      if (!name) throw new Error("Name the new outreach list.");
      const owner = orgId ?? ctx?.orgIds[0];
      if (!owner)
        throw new Error(
          "No organization resolved for the new outreach list. Pick an existing list instead.",
        );
      return { ...(await createOutreachList({ name, kind, orgId: owner })), members: [] };
    }
    const found = lists?.find((row) => row.id === chosenId);
    if (!found) throw new Error("Pick an outreach list first.");
    return found;
  };

  return {
    lists,
    chosenId,
    setChosenId,
    creating,
    setCreating,
    newName,
    setNewName,
    ready,
    resolve,
  };
}

export function OutreachListPickerFields({
  choice,
  newListLabel,
  onSubmitKey,
}: {
  choice: OutreachListChoice;
  /** What kind of list the inline "new" branch creates, in the user's words. */
  newListLabel: string;
  /** Enter inside the name field submits the caller's action. */
  onSubmitKey?: () => void;
}) {
  const { lists, chosenId, setChosenId, creating, setCreating, newName, setNewName } =
    choice;
  return (
    <div className="space-y-3">
      {!creating && (
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {lists === null ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Loading outreach lists…
            </div>
          ) : lists.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No outreach lists yet — create the first one below.
            </div>
          ) : (
            lists.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setChosenId(row.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  chosenId === row.id
                    ? "border-primary/40 bg-accent"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {row.name}
                </span>
                <ListKindBadge kind={row.list_kind} />
                <ListStatusBadge status={row.status} />
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {(row.members?.[0]?.count ?? 0).toLocaleString()} ·{" "}
                  {formatRelativeTime(row.updated_at)}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {creating ? (
        <div className="space-y-1">
          <Label htmlFor="new-outreach-list-name" className="text-xs">
            {newListLabel}
          </Label>
          <Input
            id="new-outreach-list-name"
            value={newName}
            autoFocus
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmitKey?.();
            }}
            placeholder="Outreach list name"
            className="h-9 text-sm"
          />
          {lists !== null && lists.length > 0 && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground "
              onClick={() => setCreating(false)}
            >
              Pick an existing outreach list instead
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground "
          onClick={() => setCreating(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New outreach list
        </button>
      )}
    </div>
  );
}
