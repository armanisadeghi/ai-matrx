/**
 * features/marketing/content-plan/setup/keyword-strategy.ts
 *
 * Applying a WHOLE-PLAN keyword strategy to the plan.
 *
 * The strategy is deliberately top-down (see the Content Plan Keyword
 * Strategist agent): money pages own distinct commercial primaries, and
 * educational pages exist to rank on easier terms and pass authority to a
 * money page through planned internal links. That relationship is the point —
 * so the applied record keeps it, not just the primary keyword string.
 *
 * What lands where:
 *  - `plan.node.primary_keyword_id` — the FK, resolved through the CANONICAL
 *    `ensureKeywordId` upsert (`seo.fn_upsert_keyword`, normalized-phrase
 *    dedupe lives server-side). Never a second find-or-create.
 *  - `secondary_keyword` association edges — the registered node→keyword role
 *    the feature already uses; never a parallel table.
 *  - `attributes.keyword_strategy` — page role, the money routes a supporting
 *    page feeds, and the planned internal links with their anchor text. This
 *    is the part no single-page tool can reconstruct.
 */
import { ensureKeywordId } from "@/features/marketing/data/page-keywords";
import { extractErrorMessage } from "@/utils/errors";

import { addNodeSecondaryKeyword } from "../data/associations";
import { listPlanNodes, updatePlanNode } from "../data/service";
import type { PlanNodeRow } from "../types";
import type { KeywordAssignment } from "./ai";

export const KEYWORD_STRATEGY_ATTR_KEY = "keyword_strategy";

export interface KeywordApplyResult {
  /** Pages whose primary keyword was bound. */
  bound: number;
  /** Secondary keyword edges written. */
  secondaryEdges: number;
  /** Keyword phrases newly created in the library. */
  createdKeywords: number;
  /** Assignment routes with no matching plan node. */
  unknownRoutes: string[];
  failures: string[];
}

/** The strategy record kept on the node — the cross-page relationships. */
export interface NodeKeywordStrategy {
  page_role: KeywordAssignment["pageRole"];
  supports_routes: string[];
  internal_links: Array<{ to_route: string; anchor_text: string }>;
  secondary_keywords: string[];
  reason: string;
}

function composeStrategyAttributes(
  existing: PlanNodeRow["attributes"],
  strategy: NodeKeywordStrategy,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base[KEYWORD_STRATEGY_ATTR_KEY] = strategy;
  return base;
}

/**
 * Apply the strategist's assignments to the live plan.
 *
 * Per-node isolation: one page's failure never aborts the rest — the report
 * names every one. Routes the agent invented (not in the plan) are reported,
 * never created here: adding pages is the reviewer's explicit job, not a
 * silent side effect of assigning keywords.
 */
export async function applyKeywordStrategy(args: {
  siteId: string;
  assignments: KeywordAssignment[];
  /** Write secondary keywords as association edges too (default true). */
  includeSecondary?: boolean;
}): Promise<KeywordApplyResult> {
  const includeSecondary = args.includeSecondary ?? true;
  const liveNodes = await listPlanNodes(args.siteId);
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of liveNodes) {
    if (node.route) byRoute.set(node.route, node);
  }

  const result: KeywordApplyResult = {
    bound: 0,
    secondaryEdges: 0,
    createdKeywords: 0,
    unknownRoutes: [],
    failures: [],
  };
  // One phrase can appear on several pages (a secondary here, a primary
  // there) — resolve each exactly once.
  const idByPhrase = new Map<string, string>();
  const resolvePhrase = async (phrase: string): Promise<string> => {
    const key = phrase.trim().toLowerCase();
    const cached = idByPhrase.get(key);
    if (cached) return cached;
    const id = await ensureKeywordId(phrase);
    idByPhrase.set(key, id);
    return id;
  };

  for (const assignment of args.assignments) {
    const node = byRoute.get(assignment.route);
    if (!node) {
      result.unknownRoutes.push(assignment.route);
      continue;
    }
    try {
      const strategy: NodeKeywordStrategy = {
        page_role: assignment.pageRole,
        supports_routes: assignment.supportsRoutes,
        internal_links: assignment.internalLinks.map((link) => ({
          to_route: link.toRoute,
          anchor_text: link.anchorText,
        })),
        secondary_keywords: assignment.secondaryKeywords,
        reason: assignment.reason,
      };

      let primaryKeywordId: string | null = null;
      if (assignment.primaryKeyword) {
        const before = idByPhrase.size;
        primaryKeywordId = await resolvePhrase(assignment.primaryKeyword);
        if (idByPhrase.size > before && assignment.primaryIsNew) {
          result.createdKeywords += 1;
        }
      }

      await updatePlanNode(node.id, {
        ...(primaryKeywordId ? { primary_keyword_id: primaryKeywordId } : {}),
        attributes: composeStrategyAttributes(node.attributes, strategy),
      });
      if (primaryKeywordId) result.bound += 1;

      if (includeSecondary && assignment.secondaryKeywords.length > 0) {
        for (const phrase of assignment.secondaryKeywords) {
          try {
            const keywordId = await resolvePhrase(phrase);
            // The feature's OWN registered node→keyword wrapper — the same
            // one NodeAssociations uses; assoc_add is idempotent.
            await addNodeSecondaryKeyword(node.id, keywordId);
            result.secondaryEdges += 1;
          } catch (error) {
            result.failures.push(
              `${assignment.route} secondary "${phrase}": ${extractErrorMessage(error)}`,
            );
          }
        }
      }
    } catch (error) {
      result.failures.push(
        `${assignment.route}: ${extractErrorMessage(error)}`,
      );
    }
  }
  return result;
}

/** Read a node's applied strategy back (null when never assigned). */
export function readNodeKeywordStrategy(
  node: PlanNodeRow,
): NodeKeywordStrategy | null {
  const attributes = node.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return null;
  }
  const raw = (attributes as Record<string, unknown>)[KEYWORD_STRATEGY_ATTR_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as NodeKeywordStrategy;
}
