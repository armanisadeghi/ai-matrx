"use client";

/**
 * ResearchTopicWriteTargets — the live handlers for the write half of
 * `matrx-user/research` (the targets its manifest declares).
 *
 * This is the receiving end of the 360 loop on the topic workspace: an agent
 * run launched from the header Agents popover calls
 * `applySurfaceWrite("<target>", value)` and the value lands here, through the
 * feature's CANONICAL service (`features/research/service.ts`) — never a raw
 * Supabase call from a component, never a bespoke callback.
 *
 * Why a child component and not `getWriteHandlers` on the shell's provider:
 * the shell owns no editable state. It wraps `TopicProvider`, whose store
 * holds the SERVER's topic row and exposes only `setTopic`/`setProgress`, so
 * there is nothing to stage a draft into. These handlers therefore write
 * through the service and then ask the topic store to refetch, exactly as
 * `AutonomyControl` and `KeywordManager` do after a user edit — one write
 * path, one refresh path, whoever drove it. Same seam as
 * `MarketingPageWriteTargets`.
 *
 * Renders nothing. Mount once inside the topic's `SurfaceRuntimeProvider`.
 * Every handler validates and THROWS on a bad shape; the writeback runtime
 * (`features/surfaces/runtime/surface-writeback.ts`) turns a throw into the
 * loud toast + captured error the agent reads back.
 */

import { useTopicContext } from "@/features/research/context/ResearchContext";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { RESEARCH_CONTEXT_MENU_PROPS } from "@/features/research/agent-context/buildResearchContextData";
import {
  addKeywords,
  getKeywords,
  updateTopic,
  updateTopicMeta,
} from "@/features/research/service";
import { evaluateKeywordQuota } from "@/features/research/keywordQuota";
import { AUTONOMY_CONFIG } from "@/features/research/constants";
import type { AutonomyLevel } from "@/features/research/types";

/** The autonomy vocabulary, read from the ONE config that defines it. */
const AUTONOMY_VALUES = Object.keys(AUTONOMY_CONFIG) as AutonomyLevel[];

function asString(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(`${target} expects a string value.`);
  }
  return value;
}

export function ResearchTopicWriteTargets() {
  const { topicId, topic, refresh, refreshProgress } = useTopicContext();

  useSurfaceWriteHandlers(RESEARCH_CONTEXT_MENU_PROPS.surfaceName, {
    topic_description: async (value: unknown) => {
      const next = asString(value, "topic_description").trim();
      // `updateTopicMeta` maps an empty description to NULL — clearing is a
      // legitimate outcome, so an empty string is accepted here rather than
      // rejected. (A blank NAME is refused below; a topic must have one.)
      await updateTopicMeta(topicId, { description: next });
      await refresh();
    },

    topic_name: async (value: unknown) => {
      const next = asString(value, "topic_name").trim();
      if (!next) {
        throw new Error("topic_name: a topic name cannot be empty.");
      }
      await updateTopicMeta(topicId, { name: next });
      await refresh();
    },

    add_keywords: async (value: unknown) => {
      if (!Array.isArray(value)) {
        throw new Error("add_keywords expects an array of keyword strings.");
      }
      const requested = value.map((entry, index) => {
        if (typeof entry !== "string") {
          throw new Error(
            `add_keywords: entry ${index + 1} must be a string, got ${typeof entry}.`,
          );
        }
        return entry.trim();
      });
      const keywords = Array.from(
        new Map(
          requested
            .filter(Boolean)
            .map((keyword) => [keyword.toLocaleLowerCase(), keyword]),
        ).values(),
      );
      if (keywords.length === 0) {
        throw new Error(
          "add_keywords: no usable keywords — every entry was blank.",
        );
      }
      if (!topic) {
        throw new Error(
          "add_keywords: the topic has not loaded yet, so its keyword caps cannot be checked.",
        );
      }

      // THE QUOTA GATE. `max_keywords` and `max_keyword_syntheses` are hard
      // backend gates: a keyword written past `max_keywords` is dropped by the
      // orchestrator and never researched, and past `max_keyword_syntheses` it
      // is researched but never written up — both silently, forever. So the
      // caps are checked BEFORE the row is written, against the topic's LIVE
      // keyword list (not the progress snapshot, which can lag a just-added
      // keyword), and the existing keywords double as the dedupe set.
      //
      // The shortfall is REFUSED, not resolved: raising a cap costs the user
      // real research budget, and consent for that lives in `KeywordQuotaDialog`
      // on the keywords page — a human surface, reached by a human. The agent
      // gets the numbers it needs to propose a smaller batch instead.
      const existing = await getKeywords(topicId);
      const existingLower = new Set(
        existing.map((row) => row.keyword.trim().toLocaleLowerCase()),
      );
      const fresh = keywords.filter(
        (keyword) => !existingLower.has(keyword.toLocaleLowerCase()),
      );
      if (fresh.length === 0) {
        throw new Error(
          `add_keywords: every keyword is already on this topic (${keywords.join(", ")}).`,
        );
      }

      const verdict = evaluateKeywordQuota(topic, existing.length + fresh.length);
      if (verdict.shortfalls.length > 0) {
        const detail = verdict.shortfalls
          .map(
            (shortfall) =>
              `${shortfall.label} is ${shortfall.current} and ${fresh.length} new keyword(s) would need ${shortfall.required} — ${shortfall.consequence}`,
          )
          .join(" ");
        throw new Error(
          `add_keywords refused: ${detail} This topic has ${existing.length} keyword(s) already. Propose a smaller batch, or ask the user to raise the cap on the Keywords page.`,
        );
      }

      await addKeywords(topicId, { keywords: fresh });
      await refreshProgress();
    },

    autonomy_level: async (value: unknown) => {
      const next = asString(value, "autonomy_level").trim();
      if (!AUTONOMY_VALUES.includes(next as AutonomyLevel)) {
        throw new Error(
          `autonomy_level must be one of: ${AUTONOMY_VALUES.join(" | ")}. Got "${next}".`,
        );
      }
      await updateTopic(topicId, { autonomy_level: next as AutonomyLevel });
      await refresh();
    },
  });

  return null;
}

export default ResearchTopicWriteTargets;
