"use client";

// /research/topics/[topicId]/intelligence — the research feature's
// intelligence, from inside one topic. The topic's own per-role agent choices
// (rs_topic.agent_config, managed on the Agents page) run ahead of every other
// choice for this topic, so each is shown on its job rather than hidden.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAllAgentsArray } from "@/features/agents/redux/agent-definition/selectors";
import { FeatureIntelligence } from "@/features/mandates/feature-intelligence/FeatureIntelligence";
import type { RunOverride } from "@/features/mandates/feature-intelligence/IntelligenceJobCard";
import { useTopicContext } from "../../context/ResearchContext";
import { AGENT_CONFIG_KEYS } from "../../admin/types";
import { getTopic, removeTopicAgentChoice } from "../../service";
import { ROLE_MANDATE_KEYS } from "../agents/constants";

export default function TopicIntelligencePage() {
  const { topic, topicId, refresh } = useTopicContext();
  const focus = useSearchParams().get("mandate");
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgentsArray);
  const [removedChoices, setRemovedChoices] = useState<Record<string, string>>({});
  const [topicAgents, setTopicAgents] = useState<Record<string, { name: string; available: boolean }>>({});
  const [agentLookupFailed, setAgentLookupFailed] = useState(false);

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
  const chosenIds = AGENT_CONFIG_KEYS.map((key) => config[key]).filter((id): id is string => typeof id === "string" && id.length > 0);
  const chosenKey = [...new Set(chosenIds)].sort().join(",");
  useEffect(() => {
    if (!chosenKey) return;
    let cancelled = false;
    const ids = chosenKey.split(",");
    void supabase.schema("agent").from("definition")
      .select("id,name,is_active,is_archived,deleted_at")
      .in("id", ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // A failed lookup is unknown, not evidence that the agent is missing.
          setTopicAgents({});
          setAgentLookupFailed(true);
          return;
        }
        setAgentLookupFailed(false);
        const byId: Record<string, { name: string; available: boolean }> = {};
        for (const id of ids) byId[id] = { name: "Selected agent", available: false };
        for (const agent of data ?? []) byId[agent.id] = {
          name: agent.name,
          available: agent.is_active && !agent.is_archived && !agent.deleted_at,
        };
        setTopicAgents(byId);
      });
    return () => { cancelled = true; };
  }, [chosenKey]);
  const runOverrides: Record<string, RunOverride> = {};
  for (const key of AGENT_CONFIG_KEYS) {
    const agentId = config[key];
    if (typeof agentId !== "string" || !agentId || removedChoices[key] === agentId) continue;
    runOverrides[ROLE_MANDATE_KEYS[key]] = {
      holderId: agentId,
      holderName: topicAgents[agentId]?.name ?? agents.find((agent) => agent.id === agentId)?.name ?? "Selected agent",
      health: topicAgents[agentId]
        ? topicAgents[agentId].available ? "available" : "unavailable"
        : agentLookupFailed ? "unknown" : "checking",
      manageHref: `/research/topics/${topicId}/agents`,
      contextLabel: "This topic",
    };
  }

  const clearRunOverride = async (mandateKey: string) => {
    const key = AGENT_CONFIG_KEYS.find((candidate) => ROLE_MANDATE_KEYS[candidate] === mandateKey);
    if (!key) throw new Error("This job has no topic-level agent choice to remove.");
    const expectedId = runOverrides[mandateKey]?.holderId;
    if (!expectedId) return;
    await removeTopicAgentChoice(topicId, key, expectedId);
    const latest = await getTopic(topicId);
    if (!latest || (latest.agent_config && typeof latest.agent_config === "object" && !Array.isArray(latest.agent_config) && latest.agent_config[key] === expectedId)) {
      throw new Error("The topic choice could not be confirmed as removed. Refresh and check this job.");
    }
    setRemovedChoices((current) => ({ ...current, [key]: expectedId }));
    await refresh();
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <FeatureIntelligence
        feature="research"
        context={{ topicId }}
        focusMandateKey={focus}
        runOverrides={runOverrides}
        clearRunOverride={clearRunOverride}
      />
    </div>
  );
}
