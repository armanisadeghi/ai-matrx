"use client";

/**
 * 🚨 LEGACY — the SEO intent of a plan node that has NO real page yet.
 *
 * THE ONE SEO plan lives on `web.page` and is edited by
 * `features/marketing/seo/plan/SeoPlanEditor.tsx` (content-planning invariant
 * 9; Arman, 2026-08-16). This file is the remaining editor of the plan-node
 * store (`plan.node.primary_keyword_id`, its `secondary_keyword` edges, its
 * meta columns, and `attributes.keyword_strategy`), and NodePanel falls back to
 * it only while a node has no `web.page` to plan against. It is deleted whole —
 * this editor and `SeoPlanSection` below — when the storage migration lands.
 *
 * Keyword entry is delegated to KeywordPicker → canonical KeywordInput; this
 * component only composes the plan-specific persistence around it.
 */
import Link from "next/link";
import { BrainCircuit, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetaRecommendations } from "@/features/marketing/seo/serp/MetaRecommendations";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import {
  evaluateMetaDescription,
  evaluateMetaTitle,
} from "@/features/marketing/seo/serp/metrics";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { contentPlanNodeManifest } from "@/features/surfaces/manifests/content-plan-node.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  useKeywordLabels,
  usePlanNodeEdgeMutation,
  usePlanNodeEdges,
} from "../data/hooks";
import {
  readNodeKeywordStrategy,
  type NodeKeywordStrategy,
} from "../setup/keyword-strategy";
import type { PlanNodeRow } from "../types";
import { PLAN_NODE_SECONDARY_KEYWORD_ROLE, SEO_KEYWORD_TOKEN } from "../types";
import { KeywordPicker } from "./KeywordPicker";
import { planNodeHref } from "./PlanContextPanel";

const L = surfaceValueLabels(contentPlanNodeManifest);

export function NodeSeoIntentEditor({
  nodeId,
  siteId,
  organizationId,
  primaryKeywordId,
  metaTitle,
  metaDescription,
  onPrimaryKeywordChange,
  onMetaTitleChange,
  onMetaDescriptionChange,
}: {
  nodeId: string;
  siteId: string;
  organizationId: string;
  primaryKeywordId: string | null;
  metaTitle: string;
  metaDescription: string;
  onPrimaryKeywordChange: (keywordId: string | null) => void;
  onMetaTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
}) {
  const openKeywordWindow = useOpenKeywordWindow();
  const edges = usePlanNodeEdges(nodeId);
  const mutation = usePlanNodeEdgeMutation(nodeId);
  const supportingEdges = (edges.data ?? []).filter(
    (edge) =>
      edge.direction === "outgoing" &&
      edge.otherType === SEO_KEYWORD_TOKEN &&
      edge.role === PLAN_NODE_SECONDARY_KEYWORD_ROLE,
  );
  const labels = useKeywordLabels(supportingEdges.map((edge) => edge.otherId));
  const phraseById = new Map(
    (labels.data ?? []).map((row) => [row.id, row.phrase]),
  );
  const titleEvaluation = metaTitle.trim()
    ? evaluateMetaTitle(metaTitle)
    : null;
  const descriptionEvaluation = metaDescription.trim()
    ? evaluateMetaDescription(metaDescription)
    : null;

  const addSupporting = async (keywordId: string | null) => {
    if (!keywordId) return;
    try {
      await mutation.mutateAsync({
        kind: "add-secondary-keyword",
        keywordId,
      });
    } catch (error) {
      toast.error("Could not add supporting keyword", {
        description: extractErrorMessage(error),
      });
      throw error;
    }
  };

  const removeSupporting = async (keywordId: string) => {
    try {
      await mutation.mutateAsync({
        kind: "remove-secondary-keyword",
        keywordId,
      });
    } catch (error) {
      toast.error("Could not remove supporting keyword", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5" data-surface-value="node_primary_keyword">
        <Label className="text-xs">{L.node_primary_keyword}</Label>
        <KeywordPicker
          siteId={siteId}
          organizationId={organizationId}
          value={primaryKeywordId}
          onChange={onPrimaryKeywordChange}
          placeholder="Enter this page's main search term"
        />
      </div>

      <div
        className="space-y-1.5"
        data-surface-value="node_supporting_keywords"
      >
        <Label className="text-xs">{L.node_supporting_keywords}</Label>
        <KeywordPicker
          siteId={siteId}
          organizationId={organizationId}
          value={null}
          clearable={false}
          showDetails={false}
          placeholder="Add any supporting keyword"
          onChange={addSupporting}
        />
        {edges.isError ? (
          <p className="text-xs text-destructive">
            {extractErrorMessage(edges.error)}
          </p>
        ) : supportingEdges.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No supporting keywords yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {supportingEdges.map((edge) => {
              const phrase = phraseById.get(edge.otherId) ?? "Loading keyword…";
              return (
                <span
                  key={edge.otherId}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-muted pl-2 text-xs text-foreground"
                >
                  <button
                    type="button"
                    className="max-w-52 truncate py-1 text-left hover:text-primary"
                    title={`Open Keyword Intelligence for ${phrase}`}
                    disabled={!phraseById.has(edge.otherId)}
                    onClick={() =>
                      openKeywordWindow({ phrase, organizationId, siteId })
                    }
                  >
                    {phrase}
                  </button>
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-primary"
                    aria-label={`Open Keyword Intelligence for ${phrase}`}
                    disabled={!phraseById.has(edge.otherId)}
                    onClick={() =>
                      openKeywordWindow({ phrase, organizationId, siteId })
                    }
                  >
                    <BrainCircuit className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 pr-1.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${phrase}`}
                    onClick={() => void removeSupporting(edge.otherId)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1.5" data-surface-value="node_meta_title">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`node-meta-title-${nodeId}`} className="text-xs">
            {L.node_meta_title}
          </Label>
          {titleEvaluation ? (
            <SerpFieldChips
              chars={titleEvaluation.charCount}
              pixels={titleEvaluation.pixelWidth}
              ok={titleEvaluation.ok}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              0 characters
            </span>
          )}
        </div>
        <Input
          id={`node-meta-title-${nodeId}`}
          value={metaTitle}
          onChange={(event) => onMetaTitleChange(event.target.value)}
          placeholder="Title you want searchers to see"
        />
      </div>

      <div className="space-y-1.5" data-surface-value="node_meta_description">
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor={`node-meta-description-${nodeId}`}
            className="text-xs"
          >
            {L.node_meta_description}
          </Label>
          {descriptionEvaluation ? (
            <SerpFieldChips
              chars={descriptionEvaluation.charCount}
              pixels={descriptionEvaluation.pixelWidth}
              ok={descriptionEvaluation.ok}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              0 characters
            </span>
          )}
        </div>
        <Textarea
          id={`node-meta-description-${nodeId}`}
          value={metaDescription}
          minHeight={86}
          maxHeight={160}
          onChange={(event) => onMetaDescriptionChange(event.target.value)}
          placeholder="Description you want searchers to see"
        />
      </div>

      {titleEvaluation?.issues.length ||
      descriptionEvaluation?.issues.length ? (
        <MetaRecommendations
          titleEval={titleEvaluation}
          descriptionEval={descriptionEvaluation}
          compact
          issuesOnly
        />
      ) : null}
    </div>
  );
}

/**
 * LEGACY, AND ONLY WHILE THE STORE IS LEGACY. The strategist's assignment as
 * stored on `plan.node.attributes.keyword_strategy` — page role, the money
 * routes this page feeds, and the planned internal links. It renders in
 * exactly ONE place: the NodePanel branch for a node with no `web.page` yet,
 * where nothing else can show this data. Everywhere a real page exists, THE
 * SEO plan is `SeoPlanEditor` over `web.page.desired_values.keyword_plan`,
 * directly editable. Delete this together with `NodeSeoIntentEditor` when the
 * storage migration lands.
 */
export function SeoPlanSection({
  planNode,
  siteNodes,
  workspaceHref,
}: {
  planNode: PlanNodeRow;
  siteNodes: readonly PlanNodeRow[];
  workspaceHref: string;
}) {
  // `keyword_strategy` is agent-written jsonb and the reader only proves it is
  // an object — normalize the array/string fields so one malformed record
  // can't take down the whole panel.
  const raw: NodeKeywordStrategy | null = readNodeKeywordStrategy(planNode);
  const strategy = raw
    ? {
        page_role: typeof raw.page_role === "string" ? raw.page_role : "page",
        reason: typeof raw.reason === "string" ? raw.reason : "",
        supports_routes: Array.isArray(raw.supports_routes)
          ? raw.supports_routes.filter((r) => typeof r === "string")
          : [],
        internal_links: Array.isArray(raw.internal_links)
          ? raw.internal_links.filter(
              (l) =>
                l &&
                typeof l === "object" &&
                typeof l.to_route === "string" &&
                typeof l.anchor_text === "string",
            )
          : [],
        secondary_keywords: Array.isArray(raw.secondary_keywords)
          ? raw.secondary_keywords.filter((k) => typeof k === "string")
          : [],
      }
    : null;

  // THE DOOR LAW: a strategy route that IS a plan node opens that node in the
  // plan workspace; a route the plan doesn't know renders as plain text.
  const nodeByRoute = new Map<string, PlanNodeRow>();
  for (const node of siteNodes) {
    if (node.route) nodeByRoute.set(node.route, node);
  }
  const routeDoor = (route: string) => {
    const target = nodeByRoute.get(route);
    return target ? (
      <Link
        href={planNodeHref(target.site_id, target.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-primary underline underline-offset-2"
      >
        {route}
      </Link>
    ) : (
      <span className="font-mono" title="This route is not in the plan">
        {route}
      </span>
    );
  };

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-foreground">SEO plan</h3>
      {strategy ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {strategy.page_role.replace(/[_-]/g, " ")} page
            </Badge>
            {strategy.secondary_keywords.map((phrase) => (
              <Badge key={phrase} variant="outline" className="text-[10px]">
                {phrase}
              </Badge>
            ))}
          </div>
          {strategy.reason ? (
            <p className="text-xs text-muted-foreground">{strategy.reason}</p>
          ) : null}
          {strategy.supports_routes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">
                Feeds authority to
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {strategy.supports_routes.map((route) => (
                  <li key={route}>{routeDoor(route)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {strategy.internal_links.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">
                Planned internal links — place these while writing
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {strategy.internal_links.map((link) => (
                  <li
                    key={`${link.to_route}-${link.anchor_text}`}
                    className="flex flex-wrap items-baseline gap-1.5"
                  >
                    <span className="text-foreground">
                      &ldquo;{link.anchor_text}&rdquo;
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                    {routeDoor(link.to_route)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No site-wide keyword strategy has been applied to this page. The
          strategist assigns each page a role, keywords, and planned internal
          links — run it from the{" "}
          <Link
            href={workspaceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            plan workspace
          </Link>
          .
        </p>
      )}
    </section>
  );
}

