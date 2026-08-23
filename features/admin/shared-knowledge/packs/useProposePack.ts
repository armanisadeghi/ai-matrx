"use client";

/**
 * useProposePack — run the SEO Starter Pack Proposer against real sample-site
 * demand and land the result as a DRAFT pack.
 *
 * 🚨 WHICH agent proposes is the `seo.starter_pack_proposer` MANDATE, resolved
 * inside `launchMandate` — never a raw agent id here. Inputs ride as named
 * VARIABLES (corpus_json, topic_tree_json, industry_hint, expert_rulings,
 * proposer_version); nothing machine-shaped goes through user_input.
 *
 * The run streams in the platform's own live-run surface (default display —
 * never a hand-rendered stream); this hook only watches the conversation's
 * stream phase (same pattern as `useToolComponentAgent`) and, on completion,
 * parses the structured output and calls `seo.starter_pack_from_proposal`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { abortConversation } from "@/features/agents/redux/execution-system/thunks/abort-registry";
import {
  selectLatestAccumulatedText,
  selectIsStreaming,
  selectStreamPhase,
  selectLatestError,
  type StreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import {
  fetchPackCorpus,
  packFromProposal,
  searchTopics,
  type AdminPackRecord,
} from "./data";

export const STARTER_PACK_PROPOSER_MANDATE_KEY = "seo.starter_pack_proposer";
export const PROPOSER_VERSION = "packpropose-v1";

export interface ProposePackInput {
  industryId: string | null;
  industryHint: string;
  siteIds: string[];
  expertRulings: string;
  /** Optional topic slugs to seed the tree slice the proposer sees (defaults to a name search on the hint). */
  topicQuery?: string;
}

export type ProposeStage = "idle" | "corpus" | "running" | "landing" | "done" | "error";

type Resolve = (value: string | null) => void;

function settle(ref: { current: { fn: Resolve | null } }, value: string | null) {
  const fn = ref.current.fn;
  if (!fn) return;
  ref.current.fn = null;
  fn(value);
}

/** Pull the one JSON object out of a (possibly fenced) model output. */
function parseProposal(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error("The proposer did not return a single JSON object.");
}

export function useProposePack() {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [stage, setStage] = useState<ProposeStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminPackRecord | null>(null);
  const resolveRef = useRef<{ fn: Resolve | null }>({ fn: null });

  const accumulatedText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );
  useRetainLatestRequestForViewer(conversationId, "useProposePack");
  const isStreaming = useAppSelector(
    conversationId ? selectIsStreaming(conversationId) : () => false,
  );
  const streamPhase: StreamPhase = useAppSelector(
    conversationId ? selectStreamPhase(conversationId) : () => "idle" as StreamPhase,
  );
  const requestError = useAppSelector(
    conversationId ? selectLatestError(conversationId) : () => undefined,
  );

  useEffect(() => {
    if (!resolveRef.current.fn) return;
    if (streamPhase === "complete") {
      settle(resolveRef, accumulatedText || "");
    } else if (streamPhase === "error") {
      const message =
        requestError?.user_message || requestError?.message || "The proposer run failed";
      setError(String(message));
      settle(resolveRef, null);
    }
  }, [streamPhase, accumulatedText, requestError]);

  useEffect(() => {
    return () => {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
      settle(resolveRef, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = useCallback(() => {
    if (conversationId) abortConversation(conversationId);
    settle(resolveRef, null);
    setStage("idle");
  }, [conversationId]);

  const reset = useCallback(() => {
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setConversationId(null);
    setStage("idle");
    setError(null);
    setResult(null);
  }, [conversationId, dispatch]);

  const propose = useCallback(
    async (input: ProposePackInput): Promise<AdminPackRecord | null> => {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
      settle(resolveRef, null);
      setConversationId(null);
      setError(null);
      setResult(null);
      try {
        setStage("corpus");
        const [corpus, topics] = await Promise.all([
          fetchPackCorpus(input.siteIds),
          searchTopics(input.topicQuery ?? input.industryHint.split(/[\s,/]+/)[0] ?? "", 60),
        ]);
        const topicTree = topics.map((t) => ({
          slug: t.slug,
          name: t.name,
          node_type: t.node_type,
          parent_slug: topics.find((p) => p.id === t.parent_id)?.slug ?? null,
        }));

        setStage("running");
        const textPromise = new Promise<string | null>((resolve) => {
          resolveRef.current.fn = resolve;
        });
        await launchMandate(STARTER_PACK_PROPOSER_MANDATE_KEY, {
          surfaceKey: "shared-knowledge:propose-starter-pack",
          sourceFeature: "marketing",
          config: { autoRun: true, allowChat: false, showVariablePanel: false },
          runtime: {
            variables: {
              corpus_json: JSON.stringify(corpus),
              topic_tree_json: JSON.stringify(topicTree),
              industry_hint: input.industryHint,
              expert_rulings: input.expertRulings.trim() || "none",
              proposer_version: PROPOSER_VERSION,
            },
          },
          onConversationCreated: (id) => setConversationId(id),
        });
        const text = await textPromise;
        if (text === null) {
          setStage("error");
          return null;
        }

        setStage("landing");
        const proposal = parseProposal(text);
        const pack = await packFromProposal({
          proposal,
          industryId: input.industryId,
          sourceCorpus: corpus,
          sourceSiteIds: input.siteIds,
        });
        setResult(pack);
        setStage("done");
        return pack;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not propose a pack");
        setStage("error");
        settle(resolveRef, null);
        return null;
      }
    },
    [conversationId, dispatch, launchMandate],
  );

  return { propose, cancel, reset, stage, error, result, isStreaming, conversationId };
}
