"use client";

// features/marketing/seo/topical-map/views/pages/bulk/PagesBulkActions.tsx
//
// THE BULK BAR — seven two-click flows over `seo.set_page_intents`, rendered
// inside the table's own `selection.actions` seam (the same row of
// `Button size="sm"` controls `lib/entity-list/components/EntityBulkBar.tsx`
// puts there; the count, the Clear and the select-all banner are the table's,
// never a second bar beside it).
//
// CLICK 1 opens the action's popover — the target it needs and a note.
// CLICK 2 is "Preview and apply": one `seo.map_dry_run` of the exact batch,
//         the consequence sentence, and then the write.
//
// READ-ONLY renders NOTHING. A record-only grantee does not get greyed-out
// buttons explaining what they may not do; the write controls are ABSENT.

import { useState } from "react";
import {
  Check,
  CheckCheck,
  CornerUpRight,
  Loader2,
  Merge,
  MoveRight,
  PenLine,
  Trash2,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { PagesBulkActionsProps } from "../seams";
import { BulkOutcome } from "./BulkOutcome";
import { IntentTargetPicker } from "./IntentTargetPicker";
import {
  buildBulkIntentPlan,
  bulkIntentActionVerb,
  emptyBulkIntentDraft,
  useBulkIntentFlow,
  type BulkIntentAction,
  type BulkIntentDraft,
} from "./useBulkIntentFlow";

interface BulkActionSpec {
  id: BulkIntentAction;
  label: string;
  icon: typeof Check;
  destructive?: boolean;
  /** move / merge / redirect — the writer refuses without a topic (22023). */
  needsTopic: boolean;
  /** merge / redirect — exactly one of a live page or a planned page. */
  needsTarget: boolean;
}

const ACTIONS: readonly BulkActionSpec[] = [
  { id: "keep", label: "Keep", icon: Check, needsTopic: false, needsTarget: false },
  { id: "move", label: "Move to topic", icon: MoveRight, needsTopic: true, needsTarget: false },
  { id: "merge", label: "Merge into page", icon: Merge, needsTopic: true, needsTarget: true },
  {
    id: "redirect",
    label: "Redirect to page",
    icon: CornerUpRight,
    needsTopic: true,
    needsTarget: true,
  },
  { id: "rewrite", label: "Rewrite", icon: PenLine, needsTopic: false, needsTarget: false },
  {
    id: "delete",
    label: "Delete",
    icon: Trash2,
    destructive: true,
    needsTopic: false,
    needsTarget: false,
  },
  { id: "mark_done", label: "Mark done", icon: CheckCheck, needsTopic: false, needsTarget: false },
];

export function PagesBulkActions({
  context,
  selected,
  selectedIds,
  onSettled,
}: PagesBulkActionsProps) {
  const flow = useBulkIntentFlow({ context, selected, selectedIds, onSettled });
  const [openAction, setOpenAction] = useState<BulkIntentAction | null>(null);
  const [draft, setDraft] = useState<BulkIntentDraft>(emptyBulkIntentDraft);

  // Reset the draft whenever a different action's popover opens — computed
  // during render (the react.dev pattern `NewNodeDialog` uses), never an effect.
  const [previousOpen, setPreviousOpen] = useState<BulkIntentAction | null>(null);
  if (previousOpen !== openAction) {
    setPreviousOpen(openAction);
    if (openAction) setDraft(emptyBulkIntentDraft());
  }

  // Belt to the shell's braces: the workspace already omits selection entirely
  // for a record-only grantee (CONTRACTS §1).
  if (context.readOnly) return null;

  const selectionSiteIds = [
    ...new Set(
      selected.map((item) => item.page.site_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  // The topic override on keep / rewrite / delete is offered ONLY when it can
  // change the answer: a page covering nothing has nothing for the writer to
  // derive a topic from.
  const someCoverNoTopic = selected.some((item) => item.current_topics.length === 0);

  return (
    <>
      {ACTIONS.map((action) => (
        <BulkActionPopover
          key={action.id}
          action={action}
          context={context}
          selected={selected}
          selectedIds={selectedIds}
          selectionSiteIds={selectionSiteIds}
          offersTopicOverride={!action.needsTopic && action.id !== "mark_done" && someCoverNoTopic}
          open={openAction === action.id}
          onOpenChange={(open) => setOpenAction(open ? action.id : null)}
          draft={draft}
          onDraftChange={setDraft}
          flow={flow}
          onRan={() => setOpenAction(null)}
        />
      ))}
      {flow.settled ? (
        <BulkOutcome
          outcome={flow.settled.outcome}
          sentence={flow.settled.sentence}
          onDismiss={flow.dismissSettled}
        />
      ) : null}
    </>
  );
}

function BulkActionPopover({
  action,
  context,
  selected,
  selectedIds,
  selectionSiteIds,
  offersTopicOverride,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  flow,
  onRan,
}: {
  action: BulkActionSpec;
  context: PagesBulkActionsProps["context"];
  selected: PagesBulkActionsProps["selected"];
  selectedIds: PagesBulkActionsProps["selectedIds"];
  selectionSiteIds: readonly string[];
  offersTopicOverride: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: BulkIntentDraft;
  onDraftChange: (draft: BulkIntentDraft) => void;
  flow: ReturnType<typeof useBulkIntentFlow>;
  onRan: () => void;
}) {
  const Icon = action.icon;
  const busy = flow.busyAction === action.id;
  // Only the open popover builds a plan: seven actions × a 200-row selection is
  // 1,400 items rebuilt on every keystroke otherwise, and six of them are for
  // a popover nobody is looking at.
  const plan = open ? buildBulkIntentPlan(action.id, selected, draft) : null;
  const showsFailure = flow.failure?.action === action.id;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={action.destructive ? "destructive" : "outline"}
          className="h-11 gap-1.5 px-2 text-xs lg:h-7"
          data-bulk-intent-action={action.id}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Icon className="h-3.5 w-3.5" aria-hidden />
          )}
          {action.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-96 flex-col gap-2 p-2">
        <p className="text-xs text-muted-foreground">
          {action.id === "mark_done"
            ? `Write each selected page's current destination again, marked done. ${selected.length} loaded page${selected.length === 1 ? "" : "s"} selected.`
            : `${bulkIntentActionVerb(action.id)} ${selected.length} loaded page${selected.length === 1 ? "" : "s"}. One intent per page — this replaces whatever each page carries today.`}
        </p>

        {action.id === "mark_done" ? null : (
          <IntentTargetPicker
            context={context}
            needsTopic={action.needsTopic}
            offersTopicOverride={offersTopicOverride}
            needsTarget={action.needsTarget}
            selectionSiteIds={selectionSiteIds}
            draft={draft}
            onChange={onDraftChange}
          />
        )}

        {action.id === "mark_done" ? null : (
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`bulk-intent-note-${action.id}`}
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Note (optional)
            </label>
            <Textarea
              id={`bulk-intent-note-${action.id}`}
              value={draft.note}
              maxLength={300}
              rows={2}
              placeholder="Why these pages are going there"
              className="min-h-0 text-xs"
              onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              {draft.note.length}/300 — the writer cuts a longer note at 300.
            </p>
          </div>
        )}

        {showsFailure && flow.failureText ? (
          // The function's OWN sentence, unaltered — it was written for the
          // person making this change.
          <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
            {flow.failure?.stage === "preview"
              ? "The rehearsal was refused, so nothing was written. "
              : "The write was refused. "}
            {flow.failureText}
          </p>
        ) : null}

        {plan?.blockedBecause ? (
          <p className="text-xs text-muted-foreground">{plan.blockedBecause}</p>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={action.destructive ? "destructive" : "default"}
            className="h-7 self-start px-2 text-xs"
            onClick={() => {
              void flow.run(action.id, draft).then((result) => {
                if (result === "written") onRan();
              });
            }}
          >
            {busy ? "Rehearsing and applying…" : "Preview and apply"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
