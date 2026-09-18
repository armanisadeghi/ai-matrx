"use client";

// features/marketing/seo/topical-map/views/pages/bulk/useBulkIntentFlow.ts
//
// THE TWO-CLICK BULK WRITE, and the two pure functions it is built on.
//
//   CLICK 1  opens the action's popover: the target it needs, and a note.
//   CLICK 2  "Preview and apply" — a `seo.map_dry_run` of the exact batch,
//            then the consequence sentence, then the write.
//
// The rehearsal is not decoration. `seo.set_page_intents` refuses per item, so
// the only way to say "200 would be set, 3 kept, 1 would fail — here is the
// refusal" BEFORE anything is written is to run the batch for real and roll it
// back. That sentence is what the destructive-and-expensive-actions law asks
// for: "Are you sure?" would not name a single thing that is about to change.
//
// ONE INTENT PER PAGE: every item REPLACES the page's edge, so the sentence
// says so out loud — the person is not adding a decision, they are overwriting
// whatever was there.
//
// `buildBulkIntentPlan` and `bulkConsequenceSentence` are PURE so a test can
// hold them to the recorded rows without a store, a client or a browser.

import { useState } from "react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import type { Json } from "@/types/database.types";

import { topicalMapErrorText } from "../../../errors";
import { useMapDryRun, useSetPageIntents } from "../../../hooks";
import { bulkActionNeedsConfirmation } from "../../../knobs";
import type {
  PageIntentItem,
  SetPageIntentsItem,
  SetPageIntentsResult,
} from "../../../types";
import type { PagesWorkspaceContext, SetPageIntentsOutcome } from "../seams";
import {
  mergeSetPageIntentsOutcomes,
  setPageIntentsOutcomeLine,
  toSetPageIntentsOutcome,
} from "./setPageIntentsOutcome";

/**
 * The seven things this bar does. Six are dispositions of `map_page_intent` v1;
 * `mark_done` is not a disposition at all — it re-sends the page's CURRENT
 * decision with `state: "done"` (R15: done is a human action this round).
 */
export type BulkIntentAction =
  | "keep"
  | "move"
  | "merge"
  | "redirect"
  | "rewrite"
  | "delete"
  | "mark_done";

/** What the popover has collected so far. Empty is a legitimate state. */
export interface BulkIntentDraft {
  topicSlug: string | null;
  topicName: string | null;
  intoPageId: string | null;
  intoPageLabel: string | null;
  intoNodeId: string | null;
  intoNodeLabel: string | null;
  note: string;
}

export function emptyBulkIntentDraft(): BulkIntentDraft {
  return {
    topicSlug: null,
    topicName: null,
    intoPageId: null,
    intoPageLabel: null,
    intoNodeId: null,
    intoNodeLabel: null,
    note: "",
  };
}

/** One `seo.set_page_intents` call: the function is per SITE, never per map. */
export interface BulkIntentSiteBatch {
  siteId: string;
  items: SetPageIntentsItem[];
}

export interface BulkIntentPlan {
  action: BulkIntentAction;
  bySite: BulkIntentSiteBatch[];
  itemCount: number;
  /** Selected rows the read gave no `site_id` — unwritable, and said so. */
  withoutSite: PageIntentItem[];
  /** `mark_done` only: rows carrying no intent. */
  withoutIntent: PageIntentItem[];
  /** `mark_done` only: rows whose intent cannot be re-sent exactly as it stands. */
  unrebuildable: PageIntentItem[];
  /** keep / rewrite / delete with no topic override: rows covering no live topic. */
  onNoTopic: PageIntentItem[];
  /** What the draft still needs. Null when the flow can run. */
  blockedBecause: string | null;
}

/** The writer's 300-character ceiling, applied before the call rather than after. */
const NOTE_MAX_CHARS = 300;

export function trimIntentNote(note: string): string | undefined {
  const trimmed = note.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, NOTE_MAX_CHARS);
}

const ACTION_VERB: Record<BulkIntentAction, string> = {
  keep: "Keep",
  move: "Move",
  merge: "Merge",
  redirect: "Redirect",
  rewrite: "Rewrite",
  delete: "Delete",
  mark_done: "Mark done",
};

export function bulkIntentActionVerb(action: BulkIntentAction): string {
  return ACTION_VERB[action];
}

/** `EntityRefResolved` carries an id; `EntityRefHidden` deliberately does not. */
function resolvedRefId(into: unknown): string | null {
  if (typeof into !== "object" || into === null) return null;
  const record = into as Record<string, unknown>;
  if (record.hidden === true) return null;
  return typeof record.id === "string" && record.id.length > 0 ? record.id : null;
}

function resolvedRefType(into: unknown): string | null {
  if (typeof into !== "object" || into === null) return null;
  const record = into as Record<string, unknown>;
  return typeof record.type === "string" ? record.type : null;
}

/**
 * Turns the selection and the draft into the exact per-site batches the write
 * will send — and into the four buckets of rows that will NOT be written, each
 * of which the consequence sentence names. A row is never silently left out.
 */
export function buildBulkIntentPlan(
  action: BulkIntentAction,
  selected: readonly PageIntentItem[],
  draft: BulkIntentDraft,
): BulkIntentPlan {
  const bySite = new Map<string, SetPageIntentsItem[]>();
  const withoutSite: PageIntentItem[] = [];
  const withoutIntent: PageIntentItem[] = [];
  const unrebuildable: PageIntentItem[] = [];
  const onNoTopic: PageIntentItem[] = [];
  const note = trimIntentNote(draft.note);

  const destinationCount =
    (draft.intoPageId ? 1 : 0) + (draft.intoNodeId ? 1 : 0);

  // What the draft is still missing, decided BEFORE anything is built so the
  // popover can say the one sentence instead of showing a control that cannot
  // act.
  let blockedBecause: string | null = null;
  if (action === "move" && !draft.topicSlug) {
    blockedBecause = "Pick the topic these pages are moving to.";
  } else if ((action === "merge" || action === "redirect") && !draft.topicSlug) {
    blockedBecause = `Pick the topic these pages will sit under once they ${action === "merge" ? "are merged" : "redirect"}.`;
  } else if ((action === "merge" || action === "redirect") && destinationCount === 0) {
    blockedBecause =
      "Pick the page — live or planned — these pages point at. seo.set_page_intents needs exactly one destination.";
  } else if ((action === "merge" || action === "redirect") && destinationCount > 1) {
    blockedBecause =
      "Two destinations are chosen. seo.set_page_intents takes exactly one of a live page or a planned page — clear one.";
  }

  if (blockedBecause) {
    return {
      action,
      bySite: [],
      itemCount: 0,
      withoutSite: [],
      withoutIntent: [],
      unrebuildable: [],
      onNoTopic: [],
      blockedBecause,
    };
  }

  for (const item of selected) {
    const siteId = item.page.site_id;
    if (!siteId) {
      // The shell makes these unselectable; this is the belt to that braces —
      // the call is per site and there is nothing to call.
      withoutSite.push(item);
      continue;
    }

    let entry: SetPageIntentsItem | null = null;

    if (action === "mark_done") {
      const intent = item.intent;
      if (!intent) {
        withoutIntent.push(item);
        continue;
      }
      const topicSlug = intent.topic?.slug ?? null;
      if (intent.disposition === "merge" || intent.disposition === "redirect") {
        const intoId = resolvedRefId(intent.into);
        const intoType = resolvedRefType(intent.into);
        if (!topicSlug || !intoId || (intoType !== "web_page" && intoType !== "plan_node")) {
          // Its destination left the map, or the viewer cannot open it: there
          // is no way to write the SAME decision again, and inventing one
          // would change what the person decided.
          unrebuildable.push(item);
          continue;
        }
        entry =
          intoType === "web_page"
            ? {
                page_id: item.page.id,
                disposition: intent.disposition,
                topic_slug: topicSlug,
                into_page_id: intoId,
                state: "done",
                ...(intent.note ? { note: intent.note } : {}),
              }
            : {
                page_id: item.page.id,
                disposition: intent.disposition,
                topic_slug: topicSlug,
                into_node_id: intoId,
                state: "done",
                ...(intent.note ? { note: intent.note } : {}),
              };
      } else if (intent.disposition === "move") {
        if (!topicSlug) {
          unrebuildable.push(item);
          continue;
        }
        entry = {
          page_id: item.page.id,
          disposition: "move",
          topic_slug: topicSlug,
          state: "done",
          ...(intent.note ? { note: intent.note } : {}),
        };
      } else {
        // An item REPLACES the edge, so re-sending without the note would
        // delete a sentence somebody wrote.
        entry = topicSlug
          ? {
              page_id: item.page.id,
              disposition: intent.disposition,
              topic_slug: topicSlug,
              state: "done",
              ...(intent.note ? { note: intent.note } : {}),
            }
          : {
              page_id: item.page.id,
              disposition: intent.disposition,
              state: "done",
              ...(intent.note ? { note: intent.note } : {}),
            };
      }
    } else if (action === "move") {
      entry = {
        page_id: item.page.id,
        disposition: "move",
        topic_slug: draft.topicSlug as string,
        state: "accepted",
        ...(note ? { note } : {}),
      };
    } else if (action === "merge" || action === "redirect") {
      entry = draft.intoPageId
        ? {
            page_id: item.page.id,
            disposition: action,
            topic_slug: draft.topicSlug as string,
            into_page_id: draft.intoPageId,
            state: "accepted",
            ...(note ? { note } : {}),
          }
        : {
            page_id: item.page.id,
            disposition: action,
            topic_slug: draft.topicSlug as string,
            into_node_id: draft.intoNodeId as string,
            state: "accepted",
            ...(note ? { note } : {}),
          };
    } else {
      // keep / rewrite / delete. Without `topic_slug` the writer derives the
      // topic from the page's own highest-confidence `covers` edge — and
      // raises 22023 for a page that covers nothing. Those rows are still
      // SENT (the server is the authority and its sentence reaches the person
      // verbatim) and counted here so the sentence can warn first.
      if (item.current_topics.length === 0 && !draft.topicSlug) onNoTopic.push(item);
      entry = draft.topicSlug
        ? {
            page_id: item.page.id,
            disposition: action,
            topic_slug: draft.topicSlug,
            state: "accepted",
            ...(note ? { note } : {}),
          }
        : {
            page_id: item.page.id,
            disposition: action,
            state: "accepted",
            ...(note ? { note } : {}),
          };
    }

    const existing = bySite.get(siteId);
    if (existing) existing.push(entry);
    else bySite.set(siteId, [entry]);
  }

  const batches = [...bySite.entries()].map(([siteId, items]) => ({ siteId, items }));
  const itemCount = batches.reduce((total, batch) => total + batch.items.length, 0);

  if (itemCount === 0) {
    blockedBecause =
      action === "mark_done"
        ? "None of the selected pages carry an intent, so there is nothing to mark done."
        : "None of the selected pages can be written — the list gave no site for any of them, and seo.set_page_intents is called per site.";
  }

  return {
    action,
    bySite: batches,
    itemCount,
    withoutSite,
    withoutIntent,
    unrebuildable,
    onNoTopic,
    blockedBecause,
  };
}

export interface BulkConsequenceInput {
  plan: BulkIntentPlan;
  draft: BulkIntentDraft;
  /** The rehearsal's own answer, narrowed. */
  preview: SetPageIntentsOutcome;
  /** Every id the person has ticked, loaded on this page of results or not. */
  selectedIdCount: number;
  /** How many of those are loaded — the only ones this write can carry. */
  loadedCount: number;
}

/**
 * THE SENTENCE. It names the verb, the count, the destination, what the
 * rehearsal answered, that the existing intent is replaced, and every row that
 * is NOT going — then quotes the first refusals verbatim.
 */
export function bulkConsequenceSentence({
  plan,
  draft,
  preview,
  selectedIdCount,
  loadedCount,
}: BulkConsequenceInput): string {
  const verb = bulkIntentActionVerb(plan.action);
  const pages = `${plan.itemCount} page${plan.itemCount === 1 ? "" : "s"}`;

  let destination = "";
  if (plan.action === "merge" || plan.action === "redirect") {
    const target = draft.intoPageLabel ?? draft.intoNodeLabel ?? "the chosen page";
    destination = ` to «${target}» under topic «${draft.topicSlug ?? ""}»`;
  } else if (plan.action === "move") {
    destination = ` to topic «${draft.topicSlug ?? ""}»`;
  } else if (draft.topicSlug && plan.action !== "mark_done") {
    destination = ` under topic «${draft.topicSlug}»`;
  }

  const sentences: string[] = [
    `${verb} ${pages}${destination}: ${preview.set} would be set, ${preview.kept} kept (a person already decided them), ${preview.failed} would fail.`,
    plan.action === "mark_done"
      ? "Each page's current destination is written again and marked done."
      : "Each page's existing intent is replaced.",
  ];

  if (selectedIdCount > loadedCount) {
    sentences.push(
      `${selectedIdCount - loadedCount} more selected page${selectedIdCount - loadedCount === 1 ? " is" : "s are"} not loaded on this page of results and ${selectedIdCount - loadedCount === 1 ? "is" : "are"} not included.`,
    );
  }
  if (plan.withoutSite.length > 0) {
    sentences.push(
      `${plan.withoutSite.length} selected page${plan.withoutSite.length === 1 ? "" : "s"} carry no site, and seo.set_page_intents is called per site — they are left out.`,
    );
  }
  if (plan.withoutIntent.length > 0) {
    sentences.push(
      `${plan.withoutIntent.length} of ${plan.withoutIntent.length + plan.itemCount + plan.unrebuildable.length} have no intent and were skipped.`,
    );
  }
  if (plan.unrebuildable.length > 0) {
    sentences.push(
      `${plan.unrebuildable.length} carry an intent whose destination has left the map, so the same decision cannot be written again from here.`,
    );
  }
  if (plan.onNoTopic.length > 0) {
    sentences.push(
      `${plan.onNoTopic.length} of these pages cover no topic, so there is nothing for the writer to derive one from and it will refuse them (22023). Choose a topic here to give them one.`,
    );
  }

  if (preview.failed > 0 && preview.failedRows.length > 0) {
    const first = preview.failedRows.slice(0, 3).map((row) => `"${row.error}"`);
    const rest = preview.failedRows.length - first.length;
    sentences.push(
      `The rehearsal refused: ${first.join("; ")}${rest > 0 ? ` (and ${rest} more)` : ""}.`,
    );
  }

  return sentences.join(" ");
}

/** Where a flow stopped, so the popover can say which half of it failed. */
export interface BulkIntentFailure {
  action: BulkIntentAction;
  stage: "preview" | "write";
  error: unknown;
}

export interface BulkIntentSettled {
  action: BulkIntentAction;
  outcome: SetPageIntentsOutcome;
  /** The same sentence the dialog showed — or would have, when the knob says never. */
  sentence: string;
}

export type BulkIntentRunResult =
  | "blocked"
  | "cancelled"
  | "preview_failed"
  | "write_failed"
  | "written";

export function useBulkIntentFlow({
  context,
  selected,
  selectedIds,
  onSettled,
}: {
  context: PagesWorkspaceContext;
  selected: readonly PageIntentItem[];
  selectedIds: readonly string[];
  onSettled: (outcome: SetPageIntentsOutcome) => void;
}) {
  const dryRun = useMapDryRun();
  const write = useSetPageIntents(context.mapId);
  const [busyAction, setBusyAction] = useState<BulkIntentAction | null>(null);
  const [failure, setFailure] = useState<BulkIntentFailure | null>(null);
  const [settled, setSettled] = useState<BulkIntentSettled | null>(null);

  async function run(
    action: BulkIntentAction,
    draft: BulkIntentDraft,
  ): Promise<BulkIntentRunResult> {
    const plan = buildBulkIntentPlan(action, selected, draft);
    if (plan.blockedBecause) return "blocked";

    setFailure(null);
    setBusyAction(action);
    try {
      // ── The rehearsal, one call per site. Positional args, in the order
      //    `seo.set_page_intents(p_site_id, p_items, p_source)` declares them.
      const previews: SetPageIntentsOutcome[] = [];
      try {
        for (const batch of plan.bySite) {
          const rehearsal = await dryRun.mutateAsync({
            fn: "set_page_intents",
            args: [batch.siteId, batch.items as unknown as Json, "human"],
          });
          previews.push(
            toSetPageIntentsOutcome(
              rehearsal.would_return as unknown as SetPageIntentsResult,
            ),
          );
        }
      } catch (error) {
        setFailure({ action, stage: "preview", error });
        return "preview_failed";
      }

      const preview = mergeSetPageIntentsOutcomes(previews);
      const sentence = bulkConsequenceSentence({
        plan,
        draft,
        preview,
        selectedIdCount: selectedIds.length,
        loadedCount: selected.length,
      });

      // The knob decides whether the dialog BLOCKS. It never decides whether
      // the person is told: when it says `never`, the same sentence is the
      // outcome line (`bulkActionNeedsConfirmation`'s own header says the law
      // is not a preference an organization can switch off).
      if (bulkActionNeedsConfirmation(context.knobs, plan.itemCount)) {
        const accepted = await confirm({
          title: `${bulkIntentActionVerb(action)} ${plan.itemCount} page${plan.itemCount === 1 ? "" : "s"}`,
          description: sentence,
          confirmLabel: bulkIntentActionVerb(action),
          variant: action === "delete" ? "destructive" : "default",
        });
        if (!accepted) return "cancelled";
      }

      const written: SetPageIntentsOutcome[] = [];
      try {
        for (const batch of plan.bySite) {
          const result = await write.mutateAsync({
            siteId: batch.siteId,
            items: batch.items,
            source: "human",
          });
          written.push(toSetPageIntentsOutcome(result));
        }
      } catch (error) {
        setFailure({ action, stage: "write", error });
        return "write_failed";
      }

      const outcome = mergeSetPageIntentsOutcomes(written);
      setSettled({ action, outcome, sentence });
      const line = setPageIntentsOutcomeLine(outcome);
      // A per-item refusal is not a broken batch, so it is a warning rather
      // than an error — and a warning still reaches the Error Inspector, which
      // is where an unexplained refusal has to end up.
      if (outcome.failed > 0) toast.warning(line);
      else toast.success(line);
      onSettled(outcome);
      return "written";
    } finally {
      setBusyAction(null);
    }
  }

  return {
    run,
    busyAction,
    failure,
    failureText: failure ? topicalMapErrorText(failure.error) : null,
    settled,
    dismissSettled: () => setSettled(null),
    clearFailure: () => setFailure(null),
  };
}
