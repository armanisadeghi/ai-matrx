"use client";

/**
 * features/marketing/seo/topical-map/proposals/MapTopicProposalView.tsx — THE
 * ONE component for `map_topic_proposal_v1` (R12; "a shape has exactly ONE
 * component"). Chat renders it through the compiled kind bridge, the map
 * author's result screen (Lane E) renders it directly, and nothing else ever
 * draws a proposed tree.
 *
 * It is an ADAPTER over `TopicTree` (R11): the proposal's flat `parent_slug`
 * list becomes rows through `topicRows.ts`, and expansion / selection /
 * checking live in component state because a proposal in a chat message is
 * not a workspace — there is no map slice to keep them in.
 *
 * ACCEPT / REJECT NEED A MAP. The kind carries no `map_id` (the mandate's
 * output schema is the tree, the run result carries the map), so the controls
 * appear only when a host names the map — `mapId` from the author result, or
 * a `map_id` the payload happens to carry — AND the node is still `proposed`.
 * Accepting = `seo.patch_map_topics` status → `active`; rejecting =
 * `seo.reject_map_topics` with the attachment policy. Without a map the tree
 * is read-only and SAYS SO, with the reason, rather than showing controls that
 * would do nothing.
 *
 * `__kind` is part of the data and travels with it — the value is read, never
 * reshaped, and the marker is never destructured away.
 */

import { useState } from "react";
import {
  BrainCircuit,
  Check,
  CircleSlash,
  ExternalLink,
  Info,
  PanelRightOpen,
  Rows3,
} from "lucide-react";

import { Button } from "@ai-matrx/design-system";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TopicTree } from "@/components/official/topic-tree/TopicTree";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { useOpenTopicalMapCanvas } from "../canvas/useOpenTopicalMapCanvas";
import { TopicalMapFailed } from "../components/TopicalMapStates";
import { usePatchMapTopics, useRejectMapTopics } from "../hooks";
import { MAP_CURATION_MANDATE_KEY, TOPICAL_MAP_SURFACE_NAME } from "../mandateKeys";
import type { MapTopicProposal } from "../map-author";
import type { MapTopicRejectionPolicy, MapTopicsPatchResult } from "../types";
import { TopicStatusMark } from "../ui/TopicStatusMark";
import { RejectPolicyPicker, rejectPolicySentence } from "./RejectPolicyPicker";
import {
  expandableSlugs,
  flattenProposalNodes,
  orphanedProposalNodes,
  topicTreeRows,
} from "./topicRows";

export interface MapTopicProposalViewProps {
  proposal: MapTopicProposal;
  /**
   * The map the proposal was written to. Enables accept / reject and the
   * doors (canvas, window, page). Null = a tree with no map behind it.
   */
  mapId?: string | null;
  /** A record-only viewer, or a host with no writes. Controls are ABSENT. */
  readOnly?: boolean;
  /** Chat is compact; a result screen has room. */
  density?: "compact" | "comfortable";
  className?: string;
}

const NO_MAP_REASON =
  "This tree has no map behind it — the run that produced it did not name one — so there is nothing to accept or reject here. Start a map from it on the Content home.";

export function MapTopicProposalView({
  proposal,
  mapId = null,
  readOnly = false,
  density = "compact",
  className,
}: MapTopicProposalViewProps) {
  const topics = flattenProposalNodes(proposal.topics);
  const orphans = orphanedProposalNodes(proposal.topics);
  const [expanded, setExpanded] = useState<Set<string>>(() => expandableSlugs(topics));
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const proposedSlugs = topics.filter((t) => t.status === "proposed").map((t) => t.slug);
  const canDecide = Boolean(mapId) && !readOnly && proposedSlugs.length > 0;

  const rows = topicTreeRows(
    topics,
    { expanded, selected, ...(canDecide ? { checked } : {}) },
    (topic) => ({
      trailing: topic.status ? <TopicStatusMark status={topic.status} compact /> : undefined,
    }),
  );

  const targetSlugs = checked.size > 0 ? [...checked] : proposedSlugs;

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Rows3 className="h-4 w-4 text-primary" aria-hidden />
            Proposed topical map
          </span>
          <span className="text-xs text-muted-foreground">
            {topics.length} topic{topics.length === 1 ? "" : "s"}
            {proposedSlugs.length > 0 && proposedSlugs.length !== topics.length
              ? ` · ${proposedSlugs.length} proposed`
              : ""}
            {proposal.source_kind ? ` · from ${proposal.source_kind.replace(/_/g, " ")}` : ""}
          </span>
          {mapId ? (
            <EntityRef token="seo_topical_map" id={mapId} name="Open the map" />
          ) : null}
        </div>
        {proposal.summary ? <p className="text-sm text-foreground">{proposal.summary}</p> : null}
      </header>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm">
          <p className="font-medium">No topics were proposed</p>
          <p className="mt-1 text-muted-foreground">
            The author invents nothing the source does not support, so an empty tree is a real
            answer. What the source could not settle is below.
          </p>
        </div>
      ) : (
        <TopicTree
          rows={rows}
          ariaLabel="Proposed topics"
          density={density}
          className={cn("rounded-xl border border-border", density === "compact" ? "max-h-96" : "")}
          onToggleExpand={(id) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelect={(id) => setSelected(id)}
          {...(canDecide
            ? {
                onCheck: (id: string) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else if (proposedSlugs.includes(id)) next.add(id);
                    return next;
                  }),
              }
            : {})}
        />
      )}

      {orphans.length > 0 ? (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              {orphans.length === 1 ? "One topic names" : `${orphans.length} topics name`} a parent this proposal does not contain
            </span>
            {" — shown at the top level: "}
            {orphans.map((n) => `${n.name} (under "${n.parent_slug}")`).join(", ")}.
          </span>
        </p>
      ) : null}

      {proposal.coverage_notes ? (
        <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Still to settle: </span>
            {proposal.coverage_notes}
          </span>
        </p>
      ) : null}

      {mapId ? (
        <ProposalDoors
          mapId={mapId}
          proposedCount={proposedSlugs.length}
          targetSlugs={targetSlugs}
          checkedCount={checked.size}
          canDecide={canDecide}
          onDecided={() => setChecked(new Set())}
        />
      ) : (
        <p className="text-xs text-muted-foreground">{NO_MAP_REASON}</p>
      )}
    </div>
  );
}

/**
 * The doors and the decisions, only ever rendered with a map behind them.
 * Split out so the hooks that need a map id are called with one.
 */
function ProposalDoors({
  mapId,
  proposedCount,
  targetSlugs,
  checkedCount,
  canDecide,
  onDecided,
}: {
  mapId: string;
  proposedCount: number;
  targetSlugs: string[];
  checkedCount: number;
  canDecide: boolean;
  onDecided: () => void;
}) {
  const openCanvas = useOpenTopicalMapCanvas();
  const openWindow = useOpenTopicalMapWindow();
  const openMandate = useOpenMandateWindow();
  const patch = usePatchMapTopics(mapId);
  const reject = useRejectMapTopics(mapId);

  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [policy, setPolicy] = useState<MapTopicRejectionPolicy>("error");
  const [failure, setFailure] = useState<{ what: string; error: unknown } | null>(null);
  const [patchErrors, setPatchErrors] = useState<MapTopicsPatchResult["errors"]>([]);

  const scope = checkedCount > 0 ? `the ${checkedCount} checked` : `all ${proposedCount} proposed`;

  async function runAccept(): Promise<void> {
    setFailure(null);
    setPatchErrors([]);
    try {
      const result = await patch.mutateAsync(
        targetSlugs.map((slug) => ({ slug, status: "active" as const })),
      );
      setPatchErrors(result.errors);
      if (result.updated.length > 0) {
        toast.success(
          `${result.updated.length} topic${result.updated.length === 1 ? "" : "s"} accepted into the map.`,
        );
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} edit${result.errors.length === 1 ? "" : "s"} refused — see below.`);
      }
      onDecided();
    } catch (error) {
      setFailure({ what: "accepting these topics", error });
    } finally {
      setPending(null);
    }
  }

  async function runReject(): Promise<void> {
    setFailure(null);
    setPatchErrors([]);
    try {
      const result = await reject.mutateAsync({ slugs: targetSlugs, onAttachments: policy });
      toast.success(
        `${result.rejected.length} topic${result.rejected.length === 1 ? "" : "s"} rejected. Nothing was deleted — each one is in the map's History.`,
      );
      onDecided();
    } catch (error) {
      setFailure({ what: "rejecting these topics", error });
    } finally {
      setPending(null);
    }
  }

  const busy = patch.isPending || reject.isPending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {canDecide ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={busy}
              onClick={() => setPending("accept")}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Accept {checkedCount > 0 ? `${checkedCount} checked` : "all"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setPending("reject")}
            >
              <CircleSlash className="h-3.5 w-3.5" aria-hidden />
              Reject {checkedCount > 0 ? `${checkedCount} checked` : "all"}
            </Button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => openCanvas({ mapId, screen: "outline" })}
          title="Open this map in the side canvas"
        >
          <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
          Open in canvas
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => openWindow({ mapId, screen: "outline" })}
          title="Open this map as a floating window"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open as window
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            openMandate({
              initialMandateKey: MAP_CURATION_MANDATE_KEY,
              mandateKeys: [MAP_CURATION_MANDATE_KEY],
              surfaceName: TOPICAL_MAP_SURFACE_NAME,
            })
          }
          title="Ask the map agent about this proposal"
        >
          <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
          Ask the map
        </Button>
      </div>

      {failure ? <TopicalMapFailed what={failure.what} error={failure.error} /> : null}
      {patchErrors.length > 0 ? (
        <ul role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
          {patchErrors.map((err, i) => (
            <li key={`${err.slug ?? "?"}:${i}`}>
              <span className="font-mono">{err.slug ?? "(no slug)"}</span>: {err.message}
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={pending === "accept"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Accept ${scope} topics?`}
        description={`Accepting makes ${targetSlugs.length} topic${targetSlugs.length === 1 ? "" : "s"} live in this map: pages can be placed on them, the page mapper will target them, and agents will treat them as real. This is reversible one topic at a time (retire), not as a batch.`}
        confirmLabel="Accept"
        busy={patch.isPending}
        onConfirm={() => void runAccept()}
      />
      <ConfirmDialog
        open={pending === "reject"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Reject ${scope} topics?`}
        description={`Rejecting hides ${targetSlugs.length} topic${targetSlugs.length === 1 ? "" : "s"} from the map. Nothing is deleted — each one stays in the map's History and can be restored. ${rejectPolicySentence(policy)}`}
        content={
          <RejectPolicyPicker
            mapId={mapId}
            value={policy}
            onChange={setPolicy}
            excludeSlugs={targetSlugs}
          />
        }
        confirmLabel="Reject"
        variant="destructive"
        busy={reject.isPending}
        confirmDisabled={policy === "merge_into:"}
        onConfirm={() => void runReject()}
      />
    </div>
  );
}
