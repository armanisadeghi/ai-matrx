"use client";

/**
 * features/marketing/seo/topical-map/proposals/ProposalReview.tsx — the
 * proposed topics of ONE map, reviewed through `ReviewDeck` in the
 * organization's `proposal_review_mode` (vision §2.5: one by one, accept all,
 * reject all, batch — switchable).
 *
 * Reads the workspace store (the tree the body already loaded), so the deck
 * lists proposals in TREE ORDER — a proposed child right after its proposed
 * parent — and never a second `map_tree` read. The cursor is
 * `review.cursorSlug` in the slice (CONTRACTS §3), so it survives a view
 * switch like every other choice.
 *
 * Accept = `seo.patch_map_topics` status → `active` (per-edit errors are
 * shown one by one, verbatim). Reject = `seo.reject_map_topics` with the
 * attachment policy picked beside the reject control; a refusal shows the
 * function's own sentence through `TopicalMapFailed`. Rejecting never
 * deletes — the row lands in History, where it can be restored.
 *
 * The consequence sentence is the deck's: accept_all / reject_all / batch
 * never run on the click.
 */

import { useState } from "react";

import { ReviewDeck, type ReviewMode } from "@/components/official/review-deck/ReviewDeck";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { TopicalMapFailed, TopicalMapLoading } from "../components/TopicalMapStates";
import type { MapHost } from "../components/TopicalMapWorkspaceBody";
import { usePatchMapTopics, useRejectMapTopics } from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import {
  selectMapReview,
  selectMapRootSlugs,
  selectMapTopicsBySlug,
} from "../redux/selectors";
import { setReviewCursor } from "../redux/slice";
import type { NormalizedMapTopic } from "../redux/types";
import type { MapTopicRejectionPolicy, MapTopicsPatchResult } from "../types";
import { TopicStatusMark } from "../ui/TopicStatusMark";
import { RejectPolicyPicker, rejectPolicySentence } from "./RejectPolicyPicker";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ProposalReviewProps {
  mapId: string;
  host: MapHost;
  readOnly: boolean;
  className?: string;
}

/** Every `proposed` topic of the loaded tree, in tree order. Pure; exported for tests. */
export function proposedTopicsInTreeOrder(
  topicsBySlug: Readonly<Record<string, NormalizedMapTopic>>,
  rootSlugs: readonly string[],
): NormalizedMapTopic[] {
  const out: NormalizedMapTopic[] = [];
  const seen = new Set<string>();
  const walk = (slug: string) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    const topic = topicsBySlug[slug];
    if (!topic) return;
    if (topic.status === "proposed") out.push(topic);
    for (const child of topic.childSlugs) walk(child);
  };
  for (const root of rootSlugs) walk(root);
  return out;
}

function pathNames(
  topicsBySlug: Readonly<Record<string, NormalizedMapTopic>>,
  topic: NormalizedMapTopic,
): string {
  const names: string[] = [];
  let cursor = topic.parentSlug;
  while (cursor) {
    const parent = topicsBySlug[cursor];
    if (!parent) break;
    names.unshift(parent.name);
    cursor = parent.parentSlug;
  }
  return names.length > 0 ? names.join(" › ") : "At the root of the map";
}

export function ProposalReview({ mapId, host, readOnly, className }: ProposalReviewProps) {
  const dispatch = useAppDispatch();
  const topicsBySlug = useAppSelector(selectMapTopicsBySlug(mapId));
  const rootSlugs = useAppSelector(selectMapRootSlugs(mapId));
  const review = useAppSelector(selectMapReview(mapId));
  const { knobs, loading: knobsLoading, error: knobsError } = useTopicalMapKnobs();

  const patch = usePatchMapTopics(mapId);
  const reject = useRejectMapTopics(mapId);

  const [modeOverride, setModeOverride] = useState<ReviewMode | null>(null);
  const [policy, setPolicy] = useState<MapTopicRejectionPolicy>("error");
  const [failure, setFailure] = useState<{ what: string; error: unknown } | null>(null);
  const [patchErrors, setPatchErrors] = useState<MapTopicsPatchResult["errors"]>([]);

  const proposed = proposedTopicsInTreeOrder(topicsBySlug, rootSlugs);

  if (knobsLoading || (!knobs && !knobsError)) {
    return <TopicalMapLoading what="this organization's review settings" />;
  }
  if (!knobs) {
    return <TopicalMapFailed what="this organization's review settings" error={knobsError} />;
  }
  if (readOnly) {
    // A record-only grantee sees the proposals and no controls (CONTRACTS §1).
    return (
      <p className="text-sm text-muted-foreground">
        {proposed.length} proposed topic{proposed.length === 1 ? "" : "s"} waiting for review.
        Reviewing needs edit access to this map.
      </p>
    );
  }

  const mode: ReviewMode = modeOverride ?? knobs.proposal_review_mode;

  const items = proposed.map((topic) => ({
    id: topic.slug,
    title: topic.name,
    subtitle: pathNames(topicsBySlug, topic),
    body: topic.description ? (
      <p className="text-sm text-foreground">{topic.description}</p>
    ) : (
      <p className="text-xs italic text-muted-foreground">No description was proposed.</p>
    ),
    meta: (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <TopicStatusMark status="proposed" />
        <span className="font-mono">{topic.slug}</span>
      </span>
    ),
  }));

  async function accept(ids: string[]): Promise<void> {
    setFailure(null);
    setPatchErrors([]);
    try {
      const result = await patch.mutateAsync(
        ids.map((slug) => ({ slug, status: "active" as const })),
      );
      setPatchErrors(result.errors);
      if (result.updated.length > 0) {
        toast.success(
          `${result.updated.length} topic${result.updated.length === 1 ? "" : "s"} accepted.`,
        );
      }
      if (result.errors.length > 0) {
        toast.error(
          `${result.errors.length} edit${result.errors.length === 1 ? "" : "s"} refused — the reasons are listed.`,
        );
      }
    } catch (error) {
      setFailure({ what: "accepting", error });
    }
  }

  async function rejectMany(ids: string[]): Promise<void> {
    setFailure(null);
    setPatchErrors([]);
    try {
      const result = await reject.mutateAsync({ slugs: ids, onAttachments: policy });
      toast.success(
        `${result.rejected.length} topic${result.rejected.length === 1 ? "" : "s"} rejected — kept in History, nothing deleted.`,
      );
    } catch (error) {
      setFailure({ what: "rejecting", error });
    }
  }

  return (
    <div className={className}>
      {failure ? (
        <div className="mb-3">
          <TopicalMapFailed what={`${failure.what} these proposals`} error={failure.error} />
        </div>
      ) : null}
      {patchErrors.length > 0 ? (
        <ul
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"
        >
          {patchErrors.map((err, i) => (
            <li key={`${err.slug ?? "?"}:${i}`}>
              <span className="font-mono">{err.slug ?? "(no slug)"}</span>: {err.message}
            </li>
          ))}
          <li className="list-none"><ErrorAlchemyMenu /></li>
        </ul>
      ) : null}
      <ReviewDeck
        items={items}
        mode={mode}
        onModeChange={setModeOverride}
        cursorId={review.cursorSlug}
        onCursorChange={(id) => dispatch(setReviewCursor({ mapId, slug: id }))}
        onAccept={accept}
        onReject={rejectMany}
        acceptLabel="Accept"
        rejectLabel="Reject"
        rejectOptions={
          <RejectPolicyPicker mapId={mapId} value={policy} onChange={setPolicy} />
        }
        consequence={(ids, verb) =>
          verb === "accept"
            ? `Accepting makes ${ids.length} topic${ids.length === 1 ? "" : "s"} live in this map: pages can be placed on them, the page mapper will target them, and agents will treat them as real.`
            : `Rejecting hides ${ids.length} topic${ids.length === 1 ? "" : "s"} from the map. Nothing is deleted — each one stays in History and can be restored. ${rejectPolicySentence(policy)}`
        }
        emptyState={
          <span>
            Nothing is proposed on this map right now.
            {host === "page" ? " Rejected and retired topics are listed below." : ""}
          </span>
        }
      />
    </div>
  );
}
