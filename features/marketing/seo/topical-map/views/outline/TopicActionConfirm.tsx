"use client";

/**
 * views/outline/TopicActionConfirm.tsx — the consequence dialog for retire and
 * reject (the destructive-and-expensive-actions law: a destructive click
 * STATES ITS CONSEQUENCE FIRST, naming what is lost; "Are you sure?" fails).
 *
 * The numbers in the sentence are the tree's own counts and appear ONLY when
 * the tree was loaded with them (absent is not zero). The policy for what
 * happens to attachments is deliberately NOT offered here: this dialog runs
 * the default `onAttachments: "error"`, so a topic that still carries pages,
 * planned pages or keywords is REFUSED by the database with a 23514 sentence
 * listing them — and that sentence is shown verbatim. The topic panel (Lane D)
 * is where a person chooses a policy with a dry-run preview.
 */

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppSelector } from "@/lib/redux/hooks";

import { selectMapTopic, selectMapTopicCounts } from "../../redux/selectors";

export type TopicActionKind = "retire" | "reject";

export interface PendingTopicAction {
  kind: TopicActionKind;
  slug: string;
}

export interface TopicActionConfirmProps {
  mapId: string;
  pending: PendingTopicAction | null;
  busy: boolean;
  onConfirm: (action: PendingTopicAction) => void;
  onCancel: () => void;
}

export function TopicActionConfirm({
  mapId,
  pending,
  busy,
  onConfirm,
  onCancel,
}: TopicActionConfirmProps) {
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => (open ? undefined : onCancel())}
      variant="destructive"
      busy={busy}
      title={pending ? <TopicActionTitle mapId={mapId} pending={pending} /> : ""}
      description={pending ? <TopicActionConsequence mapId={mapId} pending={pending} /> : undefined}
      confirmLabel={pending?.kind === "reject" ? "Reject topic" : "Retire topic"}
      onConfirm={() => {
        if (pending) onConfirm(pending);
      }}
    />
  );
}

function TopicActionTitle({ mapId, pending }: { mapId: string; pending: PendingTopicAction }) {
  const topic = useAppSelector(selectMapTopic(mapId, pending.slug));
  const name = topic?.name ?? pending.slug;
  return <>{pending.kind === "reject" ? `Reject «${name}»?` : `Retire «${name}»?`}</>;
}

/** The sentence. Exported for the test that pins its honesty about unloaded counts. */
export function topicActionConsequence(
  kind: TopicActionKind,
  counts: { loaded: boolean; pages: number; planned: number; keywords: number },
  hasChildren: boolean,
): string {
  const attached = counts.loaded
    ? `Its ${counts.pages} ${counts.pages === 1 ? "page" : "pages"}, ${counts.planned} planned and ${counts.keywords} ${counts.keywords === 1 ? "keyword" : "keywords"} stay attached`
    : "Its attached pages, planned pages and keywords stay attached";
  const refusal =
    " — and if anything is attached, the map refuses and tells you what is blocking it; the topic panel offers a policy for that.";
  const children = hasChildren ? " Its children move up one level." : "";
  if (kind === "reject") {
    return `It leaves the map and stays in the history, where it can be restored. ${attached}${refusal}${children}`;
  }
  return `It leaves the live map and keeps its history. ${attached}${refusal}${children}`;
}

function TopicActionConsequence({
  mapId,
  pending,
}: {
  mapId: string;
  pending: PendingTopicAction;
}) {
  const topic = useAppSelector(selectMapTopic(mapId, pending.slug));
  const counts = useAppSelector(selectMapTopicCounts(mapId, pending.slug));
  const hasChildren = (topic?.childSlugs.length ?? 0) > 0 || (topic?.childrenCount ?? 0) > 0;
  return <>{topicActionConsequence(pending.kind, counts, hasChildren)}</>;
}
