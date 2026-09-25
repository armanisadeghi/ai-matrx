"use client";

// /research/topics/[topicId]/intelligence — the research feature's
// intelligence, from inside one topic. The topic's own per-role agent choices
// (rs_topic.agent_config, managed on the Agents page) run ahead of every other
// choice for this topic, so each is shown on its job rather than hidden.

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAllAgentsArray } from "@/features/agents/redux/agent-definition/selectors";
import { FeatureIntelligence } from "@/features/mandates/feature-intelligence/FeatureIntelligence";
import type { RunOverride } from "@/features/mandates/feature-intelligence/IntelligenceJobCard";
import { useTopicContext } from "../../context/ResearchContext";
import { AGENT_CONFIG_KEYS } from "../../admin/types";
import { ROLE_MANDATE_KEYS } from "../agents/constants";

export default function TopicIntelligencePage() {
  const { topic, topicId } = useTopicContext();
  const focus = useSearchParams().get("mandate");
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgentsArray);

  useEffect(() => {
    dispatch(fetchAgentsListFull()).catch(() => {
      /* names degrade to "an agent of its own"; non-fatal */
    });
  }, [dispatch]);

  const config =
    topic?.agent_config &&
    typeof topic.agent_config === "object" &&
    !Array.isArray(topic.agent_config)
      ? (topic.agent_config as Record<string, unknown>)
      : {};
  const runOverrides: Record<string, RunOverride> = {};
  for (const key of AGENT_CONFIG_KEYS) {
    const agentId = config[key];
    if (typeof agentId !== "string" || !agentId) continue;
    runOverrides[ROLE_MANDATE_KEYS[key]] = {
      holderName:
        agents.find((agent) => agent.id === agentId)?.name ?? "an agent of its own",
      manageHref: `/research/topics/${topicId}/agents`,
      contextLabel: "This topic",
    };
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <FeatureIntelligence
        feature="research"
        context={{ topicId }}
        focusMandateKey={focus}
        runOverrides={runOverrides}
      />
    </div>
  );
}
