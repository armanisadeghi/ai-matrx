"use client";

/**
 * THE ONE APPROVAL QUEUE (register KI-045).
 *
 * Every AI proposal for one site — whatever produced it — in one list a person
 * works through: per-item decisions and select-all, every consequence listed
 * before anything runs, a reason captured wherever the write keeps one, and a
 * door on every record a row names. Proposal kinds are REGISTERED
 * (`./registry.ts`); this component knows none of them by name.
 *
 * 🚨 WHY A BATCH IS ALLOWED HERE. `features/assists/FEATURE.md` refuses bulk
 * accept in `/assists`, because there one click fires unlike actions nobody
 * read. Here the list is open before anything can be selected, every row
 * states its exact write, the confirm dialog re-lists every one of them, and
 * each item still runs through its kind's own single-item writer. Individual
 * AND all — never forced. Items that must be read on their own (a full
 * guidelines document) are never selectable.
 *
 * 🚨 ONE TREE POSITION FOR THE KIND SLOTS AND THE DIALOGS. Deciding the last
 * row empties the queue while its writer is still running. The slots (each
 * kind's reader + writer hooks) and the confirm / chooser dialogs therefore
 * render at the SAME position whether the card is shown or hidden — only the
 * card itself toggles. They used to sit inside the card in one branch and in a
 * bare fragment in the other, so every empty↔non-empty flip unmounted every
 * kind's reader and writer mid-decision, remounted fresh ones, and tore the
 * open dialog down while `run` was still awaiting it (guard:
 * `__tests__/ApprovalQueue.decision-lifecycle.test.tsx`).
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { APPROVAL_KINDS } from "./registry";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
} from "./types";

type Decision = "accept" | "reject";

interface Slot {
  source: ApprovalSource;
  decisions: ApprovalDecisions;
}

export interface ApprovalQueueSummary {
  count: number;
  loading: boolean;
  errors: number;
}

/**
 * Calls one kind's hooks in its own fixed slot and reports upward. A kind's
 * reader may use react-query, Redux or a runner hook; the queue never has to.
 */
function KindSlot({
  kind,
  scope,
  onReport,
}: {
  kind: ApprovalKind;
  scope: ApprovalScope;
  onReport: (kindId: string, slot: Slot) => void;
}) {
  const source = kind.useSource(scope);
  const decisions = kind.useDecisions(scope);
  const signature = [
    scope.siteId,
    source.loading,
    source.error ? String(source.error) : "",
    source.total,
    source.items.map((item) => item.key).join(","),
  ].join("|");
  useEffect(() => {
    onReport(kind.id, { source, decisions });
    // Report when what the queue renders changes — not on every render, which
    // would loop through the parent's state.
  }, [signature]);
  return null;
}

/** `kinds` entries are `kindId` or `kindId:subKind`. */
function matches(filter: readonly string[] | undefined, item: ApprovalItem) {
  if (!filter) return true;
  return filter.some((entry) => {
    const [kindId, subKind] = entry.split(":");
    return (
      kindId === item.kindId &&
      (subKind === undefined || subKind === item.subKind)
    );
  });
}

interface PendingDecision {
  decision: Decision;
  items: ApprovalItem[];
  choice: string | null;
}

export function ApprovalQueue({
  scope,
  kinds,
  title,
  defaultExpanded = false,
  hideWhenEmpty = true,
  onSummary,
  className,
}: {
  scope: ApprovalScope;
  /** Narrow to some kinds (`kindId` or `kindId:subKind`); omit for all. */
  kinds?: readonly string[];
  /** Header title; defaults to "Waiting on your approval". */
  title?: ReactNode;
  defaultExpanded?: boolean;
  /** Render nothing while there is nothing to decide (and nothing failed). */
  hideWhenEmpty?: boolean;
  /** For a host that aggregates many queues (the cross-site console). */
  onSummary?: (siteId: string, summary: ApprovalQueueSummary) => void;
  className?: string;
}) {
  const mounted = APPROVAL_KINDS.filter(
    (kind) =>
      !kinds || kinds.some((entry) => entry.split(":")[0] === kind.id),
  );
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [chooser, setChooser] = useState<{
    kind: ApprovalKind;
    items: ApprovalItem[];
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const report = (kindId: string, slot: Slot) =>
    setSlots((previous) => ({ ...previous, [kindId]: slot }));

  const kindById = new Map(mounted.map((kind) => [kind.id, kind]));
  const sections = mounted.map((kind) => {
    const slot = slots[kind.id];
    const items = (slot?.source.items ?? []).filter((item) =>
      matches(kinds, item),
    );
    const narrowed = kinds?.some((entry) => entry === kind.id) === false;
    return {
      kind,
      slot,
      items,
      // A sub-kind filter only knows the page it filtered.
      total: narrowed ? items.length : Math.max(slot?.source.total ?? 0, items.length),
    };
  });
  const allItems = sections.flatMap((section) => section.items);
  const count = sections.reduce((sum, section) => sum + section.total, 0);
  const loading = mounted.some((kind) => !slots[kind.id] || slots[kind.id]?.source.loading);
  const failed = sections.filter((section) => section.slot?.source.error);

  const summarySignature = `${count}|${loading}|${failed.length}`;
  useEffect(() => {
    onSummary?.(scope.siteId, { count, loading, errors: failed.length });
  }, [summarySignature, scope.siteId]);

  const selectable = allItems.filter((item) => !item.individualReview);
  const selectedItems = selectable.filter((item) => selected.has(item.key));
  const allSelected =
    selectable.length > 0 && selectedItems.length === selectable.length;
  const selectedKindIds = new Set(selectedItems.map((item) => item.kindId));
  const batchRejectNeedsOneKind =
    selectedKindIds.size > 1 &&
    [...selectedKindIds].some((id) => kindById.get(id)?.RejectChooser);

  const begin = (decision: Decision, items: ApprovalItem[]) => {
    if (items.length === 0) return;
    if (decision === "reject") {
      const kind = kindById.get(items[0]?.kindId ?? "");
      if (kind?.RejectChooser) {
        setChooser({ kind, items });
        return;
      }
    }
    setReason("");
    setPending({ decision, items, choice: null });
  };

  const copyFor = (decision: Decision, kindId: string) => {
    const kind = kindById.get(kindId);
    return kind ? kind[decision] : undefined;
  };

  const run = async (decision: PendingDecision) => {
    setBusy(true);
    const note = reason.trim() || null;
    let applied = 0;
    const failures: string[] = [];
    // Kind by kind, in queue order; each kind's writer runs its items itself.
    for (const section of sections) {
      const items = decision.items.filter((item) => item.kindId === section.kind.id);
      if (items.length === 0 || !section.slot) continue;
      const writer =
        decision.decision === "accept"
          ? section.slot.decisions.acceptItems(
              items,
              section.kind.accept.keepsReason ? note : null,
            )
          : section.slot.decisions.rejectItems(
              items,
              section.kind.reject.keepsReason ? note : null,
              decision.choice,
            );
      try {
        const outcome = await writer;
        applied += outcome.applied;
        failures.push(...outcome.failures.map((failure) => failure.message));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      section.slot.source.refetch();
    }
    setBusy(false);
    setPending(null);
    setSelected(new Set());
    if (applied > 0) {
      toast.success(
        `${decision.decision === "accept" ? "Approved" : "Rejected"} ${applied} proposal${applied === 1 ? "" : "s"}.`,
      );
    }
    if (failures.length > 0) {
      toast.error(
        `${failures.length} could not be saved and ${failures.length === 1 ? "is" : "are"} still waiting for you.`,
        { description: failures[0] },
      );
    }
  };

  const pendingCopies = pending
    ? [...new Set(pending.items.map((item) => item.kindId))].flatMap((id) => {
        const copy = copyFor(pending.decision, id);
        return copy ? [{ id, copy }] : [];
      })
    : [];
  const asksReason = pendingCopies.some(({ copy }) => copy.keepsReason);
  const reasonRequired = pendingCopies.some(
    ({ copy }) => copy.keepsReason && copy.reasonRequired,
  );
  const reasonDropped = pendingCopies
    .filter(({ copy }) => !copy.keepsReason)
    .map(({ id }) => kindById.get(id)?.label ?? id);
  const pendingLabel =
    pendingCopies.length === 1
      ? (pendingCopies[0]?.copy.label ?? "")
      : pending?.decision === "accept"
        ? "Approve"
        : "Reject";

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const hidden = hideWhenEmpty && allItems.length === 0 && failed.length === 0;

  return (
    <>
      {mounted.map((kind) => (
        <KindSlot key={kind.id} kind={kind} scope={scope} onReport={report} />
      ))}

      {hidden ? null : (
        <div
          className={cn(
            "rounded-lg border border-border bg-card px-3 py-2.5",
            className,
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {title ?? "Waiting on your approval"}
            </span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {count.toLocaleString()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Nothing here changes until you decide.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs max-md:h-10"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {expanded ? "Hide the list" : `Review ${count.toLocaleString()}`}
            </Button>
          </div>

          {failed.map((section) => (
            <InlineQueryError
              key={section.kind.id}
              what={`the ${section.kind.label.toLowerCase()} proposals`}
              error={section.slot?.source.error}
              onRetry={() => section.slot?.source.refetch()}
            />
          ))}

          {expanded && allItems.length > 0 ? (
            <div className="mt-2.5 border-t border-border pt-2">
              {/* Select-all exists only when something CAN be selected — a
                  "Select all 0" checkbox that never does anything is a dead
                  control (rows reviewed alone are never selectable). */}
              {selectable.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(selectable.map((item) => item.key)),
                      )
                    }
                    aria-label="Select every proposal shown"
                    disabled={busy}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedItems.length > 0
                      ? `${selectedItems.length} of ${allItems.length} shown selected`
                      : `Select all ${selectable.length} shown`}
                  </span>
                  {selectedItems.length > 0 ? (
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      {batchRejectNeedsOneKind ? (
                        <span className="text-[11px] text-muted-foreground">
                          Placing elsewhere needs rows of one kind
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs max-md:h-10"
                        disabled={busy}
                        onClick={() => begin("accept", selectedItems)}
                      >
                        <Check className="size-3.5" />
                        Approve {selectedItems.length}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs max-md:h-10"
                        disabled={busy || batchRejectNeedsOneKind}
                        onClick={() => begin("reject", selectedItems)}
                      >
                        <X className="size-3.5" />
                        Reject {selectedItems.length}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2.5">
                {sections
                  .filter((section) => section.items.length > 0)
                  .map((section) => (
                    <section key={section.kind.id} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 px-1.5">
                        <h3 className="text-xs font-semibold text-foreground">
                          {section.kind.label}
                        </h3>
                        <span className="text-[11px] text-muted-foreground">
                          {section.total > section.items.length
                            ? `${section.items.length} of ${section.total.toLocaleString()} shown, highest demand first`
                            : `${section.items.length}`}
                        </span>
                        {section.total > section.items.length &&
                        section.slot?.source.moreHref ? (
                          <AppLink
                            href={section.slot.source.moreHref}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                          >
                            {section.slot.source.moreLabel ?? "See them all"}
                            <ExternalLink className="size-3" />
                          </AppLink>
                        ) : null}
                      </div>
                      <ul className="space-y-1">
                        {section.items.map((item) => (
                          <li
                            key={item.key}
                            className="rounded-md px-1.5 py-1.5 hover:bg-muted/50"
                          >
                            <div className="flex items-start gap-2 max-md:flex-wrap">
                              <Checkbox
                                className="mt-0.5"
                                checked={selected.has(item.key)}
                                onCheckedChange={() => toggle(item.key)}
                                aria-label={`Select: ${item.headline}`}
                                disabled={busy || Boolean(item.individualReview)}
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="h-4 px-1 text-[10px] font-normal"
                                  >
                                    {item.badge ?? section.kind.label}
                                  </Badge>
                                  <span className="break-words text-sm text-foreground">
                                    {item.headline}
                                  </span>
                                </div>
                                {item.doors ? (
                                  <div className="break-words text-xs text-muted-foreground">
                                    {item.doors}
                                  </div>
                                ) : null}
                                <p className="break-words text-xs text-muted-foreground">
                                  {item.acceptEffect}
                                  {item.proposedBy
                                    ? ` · proposed by ${item.proposedBy}`
                                    : ""}
                                  {item.proposedAt
                                    ? ` · ${new Date(item.proposedAt).toLocaleDateString()}`
                                    : ""}
                                </p>
                              </div>
                              {/* Phones: the decisions drop to their own full-width
                                  row of 40px targets under the text, instead of a
                                  squeezed 24px column beside it. */}
                              <div className="flex shrink-0 items-center gap-1 max-md:w-full max-md:justify-end max-md:pl-6">
                                {item.individualReview ? null : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs max-md:h-10 max-md:px-3"
                                    disabled={busy}
                                    onClick={() => begin("accept", [item])}
                                  >
                                    {section.kind.accept.label}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-muted-foreground max-md:h-10 max-md:px-3"
                                  disabled={busy}
                                  onClick={() => begin("reject", [item])}
                                >
                                  {section.kind.reject.label}
                                </Button>
                              </div>
                            </div>
                            {item.individualReview ? (
                              <div className="mt-1 pl-6 max-md:pl-0">
                                {item.individualReview}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {chooser?.kind.RejectChooser ? (
        <chooser.kind.RejectChooser
          scope={scope}
          items={chooser.items}
          onCancel={() => setChooser(null)}
          onChosen={(choice, chosenReason) => {
            const items = chooser.items;
            setChooser(null);
            setReason(chosenReason ?? "");
            setPending({ decision: "reject", items, choice });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        title={`${pendingLabel} ${pending?.items.length ?? 0} proposal${pending?.items.length === 1 ? "" : "s"}?`}
        description={
          pending?.items.length === 1
            ? "This makes the following change:"
            : "This makes each of the following changes:"
        }
        content={
          pending ? (
            <div className="space-y-2">
              <div className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain rounded-md border border-border bg-muted/40 p-2">
                {pending.items.map((item) => (
                  <div key={item.key} className="text-xs">
                    <span className="block break-words font-medium text-foreground">
                      {item.headline}
                    </span>
                    <span className="block break-words text-muted-foreground">
                      {pending.decision === "accept"
                        ? item.acceptEffect
                        : item.rejectEffect}
                    </span>
                  </div>
                ))}
              </div>
              {asksReason ? (
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="text-base md:text-sm"
                  placeholder={
                    pendingCopies.find(({ copy }) => copy.keepsReason)?.copy
                      .reasonPrompt ?? "Why? (optional)"
                  }
                  aria-label="Your reason"
                />
              ) : null}
              {asksReason && reasonDropped.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Your reason is kept on every change except{" "}
                  {reasonDropped.join(", ")}, which does not store one yet.
                </p>
              ) : null}
            </div>
          ) : null
        }
        confirmLabel={`${pendingLabel} ${pending?.items.length ?? 0}`}
        busy={busy}
        confirmDisabled={reasonRequired && reason.trim().length === 0}
        onConfirm={() => {
          if (pending) void run(pending);
        }}
      />
    </>
  );
}
