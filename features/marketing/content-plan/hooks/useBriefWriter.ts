"use client";

/**
 * The node panel's "Draft brief" action — ONE page's brief, written against
 * its NEIGHBOURS and staged into the panel draft for review.
 *
 * Two things make this different from the Deepen button beside it:
 *  - Deepen writes the brief + cited sources SERVER-side and saves
 *    immediately. This stages into the draft; the user saves.
 *  - This agent is given the page's parent, siblings and children plus its
 *    keyword assignment, so the brief can avoid what a sibling owns and place
 *    the planned internal links. A brief written from one page alone
 *    duplicates its siblings — which is exactly the cannibalization the
 *    top-down keyword pass exists to prevent.
 */
import { useState } from "react";

import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { useSetupAgents } from "../setup/ai";
import {
  fetchFreshSite,
  readSiteResearchTopicId,
} from "../setup/draft";
import { readNodeKeywordStrategy } from "../setup/keyword-strategy";
import { getLatestSuccessfulDocument } from "@/features/research/service";
import type { PlanNodeRow } from "../types";

/** Parent + siblings + children — the context that prevents duplicate coverage. */
export function buildNeighbourLines(
  node: PlanNodeRow,
  allNodes: PlanNodeRow[],
): string {
  const related = allNodes.filter(
    (candidate) =>
      candidate.id !== node.id &&
      (candidate.id === node.parent_id ||
        candidate.parent_id === node.parent_id ||
        candidate.parent_id === node.id),
  );
  if (related.length === 0) return "(no neighbouring pages)";
  return related
    .slice()
    .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
    .map((item) => {
      const strategy = readNodeKeywordStrategy(item);
      return [
        item.route ?? "(no route)",
        item.label,
        strategy?.page_role ?? "unassigned",
        (item.brief ?? []).length > 0 ? "has brief" : "no brief",
      ].join(" | ");
    })
    .join("\n");
}

/** The node's keyword assignment as the agent's variable expects it. */
export function buildKeywordAssignmentLine(node: PlanNodeRow): string {
  const strategy = readNodeKeywordStrategy(node);
  if (!strategy) return "not assigned";
  const parts = [`role=${strategy.page_role}`];
  if (strategy.secondary_keywords.length > 0) {
    parts.push(`secondary='${strategy.secondary_keywords.join("', '")}'`);
  }
  if (strategy.supports_routes.length > 0) {
    parts.push(`supports=${strategy.supports_routes.join(",")}`);
  }
  if (strategy.internal_links.length > 0) {
    parts.push(
      `links: ${strategy.internal_links
        .map((link) => `'${link.anchor_text}'→${link.to_route}`)
        .join(", ")}`,
    );
  }
  return parts.join(" | ");
}

export function useBriefWriter(args: {
  node: PlanNodeRow;
  siteId: string;
  allNodes: PlanNodeRow[];
  /** Stage the result into the panel draft — the USER saves. */
  onStaged: (brief: string[]) => void;
}) {
  const agents = useSetupAgents(args.siteId);
  const [lastResult, setLastResult] = useState<{
    angle: string;
    mustNotCover: string[];
    concerns: string[];
  } | null>(null);

  const run = async () => {
    try {
      const fresh = await fetchFreshSite(args.siteId);
      const topicId = readSiteResearchTopicId(fresh.settings);
      if (!topicId) {
        toast.error(
          "No research topic is linked to this site — pick one in Setup's AI grounding bar first.",
        );
        return;
      }
      const document = await getLatestSuccessfulDocument(topicId);
      const report = (document?.content ?? "").trim();
      if (!report) {
        toast.error(
          "The linked research topic has no successful final report — run Document assembly in Research first.",
        );
        return;
      }
      const outcome = await agents.writeBrief({
        page: [
          args.node.route ?? "(no route)",
          args.node.label,
          args.node.node_type,
          args.node.page_type_id ? "typed" : "no page type",
          (args.node.brief ?? []).join(" / ") || "no brief yet",
        ].join(" | "),
        keyword_assignment: buildKeywordAssignmentLine(args.node),
        neighbours: buildNeighbourLines(args.node, args.allNodes),
        research_report: report,
        guidance: "",
      });
      args.onStaged(outcome.brief);
      setLastResult({
        angle: outcome.angle,
        mustNotCover: outcome.mustNotCover,
        concerns: outcome.concerns,
      });
      toast.success(
        `Drafted ${outcome.brief.length} brief line(s) — staged, press Save to keep them.`,
      );
    } catch (error) {
      toast.error(`Brief draft failed: ${extractErrorMessage(error)}`);
    }
  };

  return {
    run,
    busy: agents.briefBusy,
    lastResult,
    disabledReason: agents.briefBusy ? "Drafting…" : null,
    /** Live-render handle — mount `<LiveRunDisplay …/>` while drafting. */
    live: agents.live,
  };
}
