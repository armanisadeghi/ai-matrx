"use client";

// features/unified-data/where-it-lives/WhereItLives.tsx — LANE SC-1' (owner, 2026-09-23 ~22:40 PT)
//
// THE ONE UI BUILDER FOR "WHICH ORGANIZATION IS THIS IN, AND MOVE IT".
//
// A chip that names the organization a table lives in — read from the TABLE through
// `readTableHome` (custom.table_home), never from the organization the person is working in —
// and, on press, says what the store says: who may move it, what holds it where it is, and each
// of the person's other organizations with either a Move button or the sentence why it cannot go
// there. A move states its consequence first (confirm), then asks `custom.table_move`, which moves
// it or refuses with one sentence; that sentence is shown as it came.
//
// Champion: Notion's "Move to" (every page names its workspace/teamspace in the breadcrumb and
// moves from the same place) and Linear's "Move to team" (the consequence is said before the
// move). Every object page and list row renders THIS component; there is no second chip.

import { useEffect, useState } from "react";
import { ArrowRightLeft, Building2 } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import type { RecordsDataSource } from "@ai-matrx/records";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import {
  moveConsequence,
  moveTable,
  readTableHome,
  type TableHomeAnswer,
  type TableHomeDestination,
} from "./tableHome";

export interface WhereItLivesProps {
  dataSource: Pick<RecordsDataSource, "rpc">;
  tableId: string;
  /**
   * The name the surface already holds (a list row's organization), shown until the store
   * answers, and — only while the door is absent from this database — instead of it.
   */
  knownOrganizationName?: string | null | undefined;
  /** After a move lands: the page re-reads where the table lives (and the list, its rows). */
  onMoved?: ((to: { id: string; name: string }) => void) | undefined;
  /**
   * `row` is quieter, for a list; `header` for an object page's own row; `title` rides the page
   * header beside the object's name (Linear's team beside the issue title) — no frame, muted.
   */
  variant?: "header" | "row" | "title" | undefined;
}

export function WhereItLives({ dataSource, tableId, knownOrganizationName, onMoved, variant = "header" }: WhereItLivesProps) {
  const [answer, setAnswer] = useState<TableHomeAnswer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  // A LIST ROW THAT ALREADY KNOWS ITS ORGANIZATION asks the store only when pressed: forty rows
  // are not forty reads. An object page asks at once.
  const [armed, setArmed] = useState(variant !== "row" || !knownOrganizationName);

  useEffect(() => {
    if (!armed) return;
    let alive = true;
    setAnswer(null);
    void readTableHome(dataSource, tableId).then((next) => {
      if (alive) setAnswer(next);
    });
    return () => {
      alive = false;
    };
  }, [dataSource, tableId, attempt, armed]);

  const home = answer?.state === "found" ? answer.home : null;
  const name = home?.organization.name ?? knownOrganizationName ?? null;

  // Absent, never a blank or a guess: while reading with nothing known, the chip says it is reading.
  const label =
    name ??
    (answer === null || !armed
      ? "Reading where this lives…"
      : answer.state === "not-given"
        ? "Not shared with you"
        : answer.state === "door-absent"
          ? "Its organization is not named here yet"
          : "Could not ask where this lives");

  async function moveTo(to: TableHomeDestination) {
    if (!home) return;
    const go = await confirm({
      title: `Move ${home.table.name} to ${to.name}?`,
      description: moveConsequence(home, to),
      // Short on purpose: the title names the destination, and a long label pushed Cancel out of
      // the dialog (walk screenshot sc1p-W3, 2026-09-24).
      confirmLabel: "Move it",
    });
    if (!go) return;
    setMoving(to.id);
    const moved = await moveTable(dataSource, home.table.id, to.id, home.table.version);
    setMoving(null);
    if (!moved.ok) {
      toast.error(moved.sentence, moved.hint ? { description: moved.hint } : undefined);
      setAttempt((n) => n + 1);
      return;
    }
    toast.success(`${moved.tableName} now lives in ${moved.to.name}.`);
    setOpen(false);
    setAttempt((n) => n + 1);
    onMoved?.(moved.to);
  }

  const chip = (
    <button
      type="button"
      data-where-it-lives={tableId}
      data-where-it-lives-organization={home?.organization.id ?? ""}
      className={
        variant === "row"
          ? "inline-flex max-w-[14rem] items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          : variant === "title"
            ? "inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 text-[11px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground sm:text-xs"
            : "inline-flex max-w-[28rem] items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      }
      title={name ? `Lives in ${name}` : label}
    >
      <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setArmed(true);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>{chip}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 text-xs">
        <WhereItLivesBody
          answer={answer}
          knownName={knownOrganizationName ?? null}
          moving={moving}
          onMove={(to) => void moveTo(to)}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </PopoverContent>
    </Popover>
  );
}

function WhereItLivesBody({
  answer,
  knownName,
  moving,
  onMove,
  onRetry,
}: {
  answer: TableHomeAnswer | null;
  knownName: string | null;
  moving: string | null;
  onMove: (to: TableHomeDestination) => void;
  onRetry: () => void;
}) {
  if (answer === null) {
    return <p className="text-muted-foreground">Asking the record store where this table lives&hellip;</p>;
  }
  if (answer.state === "not-given") {
    return <p className="text-muted-foreground">This table has not been shared with you, so where it lives is not yours to see.</p>;
  }
  if (answer.state === "door-absent" || answer.state === "unavailable") {
    return (
      <div className="space-y-2">
        {knownName ? (
          <p>
            Lives in <span className="font-medium text-foreground">{knownName}</span>.
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {answer.state === "door-absent"
            ? "Moving it to another organization is not available on this database yet."
            : `The record store could not be asked where this lives, so nothing here is an answer about your access. ${answer.why}`}
        </p>
        {answer.state === "unavailable" ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
            Ask again
          </Button>
        ) : null}
      </div>
    );
  }
  const home = answer.home;
  return (
    <div className="space-y-2" data-where-it-lives-panel={home.table.id}>
      <p>
        <span className="text-muted-foreground">{home.table.name} lives in </span>
        <span className="font-medium text-foreground">{home.organization.name}</span>.
      </p>
      {!home.mayMove ? (
        <p className="text-muted-foreground">{home.whyNot}</p>
      ) : home.heldBy.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-foreground">It cannot move yet:</p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {home.heldBy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : home.destinations.length === 0 ? (
        <p className="text-muted-foreground">You are not a member of any other organization, so there is nowhere else to move it.</p>
      ) : (
        <div className="space-y-1">
          <p className="font-medium text-foreground">Move it to</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {home.destinations.map((to) => (
              <li key={to.id} className="flex items-start gap-2">
                {to.ok ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-full justify-start gap-1.5 text-xs"
                    data-where-it-lives-move={to.id}
                    onClick={() => onMove(to)}
                  >
                    <ArrowRightLeft className="h-3 w-3" aria-hidden />
                    {moving === to.id ? `Moving to ${to.name}…` : to.name}
                  </Button>
                ) : (
                  <p className="text-muted-foreground">
                    <span className="text-foreground">{to.name}</span> &mdash; {to.why}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
