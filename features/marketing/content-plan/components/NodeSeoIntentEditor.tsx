"use client";

/**
 * The planned page's canonical SEO intent: one primary keyword, supporting
 * keyword association edges, and the metadata the eventual page should use.
 * Keyword entry is delegated to KeywordPicker → canonical KeywordInput; this
 * component only composes the plan-specific persistence around it.
 */
import { BrainCircuit, X } from "lucide-react";

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
import { PLAN_NODE_SECONDARY_KEYWORD_ROLE, SEO_KEYWORD_TOKEN } from "../types";
import { KeywordPicker } from "./KeywordPicker";

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
