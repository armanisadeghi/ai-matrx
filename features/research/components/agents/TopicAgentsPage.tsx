"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { OverriddenCountBadge } from "@/features/agents/slots/components/OverriddenCountBadge";
import { SlotResolutionRibbon } from "@/features/agents/slots/components/SlotResolutionRibbon";
import { useTopicContext } from "../../context/ResearchContext";
import { updateTopic } from "../../service";
import { AGENT_CONFIG_KEYS, type AgentConfigKey } from "../../admin/types";
import { AgentRoleCard } from "./AgentRoleCard";
import { useResearchAgentRoles } from "./useResearchAgentRoles";

/**
 * Reads the JSONB agent_config off a topic and returns the override UUID for
 * a given role key, or null when no override is set.
 */
function readOverride(
  agentConfig: unknown,
  key: AgentConfigKey,
): string | null {
  if (!agentConfig || typeof agentConfig !== "object" || Array.isArray(agentConfig))
    return null;
  const value = (agentConfig as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export default function TopicAgentsPage() {
  const { topic, refresh } = useTopicContext();
  const dispatch = useAppDispatch();
  // DB-truth system pins from the agent-slot registry (replaces the drifted
  // hardcoded UUID constants).
  const { roles, loading: rolesLoading, error: rolesError } = useResearchAgentRoles();

  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Prefetch the user's full agent catalog so override IDs render with names
  // instead of bare UUIDs. Idempotent at the slice level.
  useEffect(() => {
    dispatch(fetchAgentsListFull()).catch(() => {
      /* names degrade to UUIDs; non-fatal */
    });
  }, [dispatch]);

  const overrides = useMemo(() => {
    const map: Record<AgentConfigKey, string | null> = {
      page_summary_agent_id: null,
      keyword_synthesis_agent_id: null,
      research_report_agent_id: null,
      updater_agent_id: null,
      consolidation_agent_id: null,
      auto_tagger_agent_id: null,
      document_assembly_agent_id: null,
    };
    if (!topic) return map;
    for (const key of AGENT_CONFIG_KEYS) {
      map[key] = readOverride(topic.agent_config, key);
    }
    return map;
  }, [topic]);

  const overrideCount = Object.values(overrides).filter(Boolean).length;
  const overridableCount = AGENT_CONFIG_KEYS.length;

  // Pure data op: applies the override and rethrows on failure so callers own
  // their success/error messaging. This lets the Copy & Update flow tell a
  // failed *connect* apart from a failed *copy*, and avoids double-toasts.
  const handleApply = async (key: AgentConfigKey, candidateId: string) => {
    if (!topic) return;
    setSavingKey(key);
    try {
      const current =
        topic.agent_config && typeof topic.agent_config === "object" && !Array.isArray(topic.agent_config)
          ? (topic.agent_config as Record<string, string>)
          : {};
      const next: Record<string, string> = { ...current, [key]: candidateId };
      await updateTopic(topic.id, { agent_config: next });
      await refresh();
    } finally {
      setSavingKey(null);
    }
  };

  const handleRemove = async (key: AgentConfigKey) => {
    if (!topic) return;
    setSavingKey(key);
    try {
      const current =
        topic.agent_config && typeof topic.agent_config === "object" && !Array.isArray(topic.agent_config)
          ? (topic.agent_config as Record<string, string>)
          : {};
      const next: Record<string, string> = { ...current };
      delete next[key];
      await updateTopic(topic.id, { agent_config: next });
      toast.success("Override removed.");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to remove override.");
    } finally {
      setSavingKey(null);
    }
  };

  if (!topic || rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40dvh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-8 py-5 lg:py-7">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="mb-6 lg:mb-8">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-foreground">
              Agents
            </h1>
            <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
              Replace any of the system agents that power this topic&apos;s
              research pipeline. Your agent must declare every variable and
              context slot the system agent does — extras are fine.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OverriddenCountBadge
              overridden={overrideCount}
              total={overridableCount}
            />
          </div>
        </div>

        {/* The canonical, truthful precedence chain — run-scope here is the
            per-topic override (rs_topic.agent_config). */}
        <SlotResolutionRibbon
          className="mt-4"
          labels={{ run: "Topic override" }}
        />
      </header>

      {/* ── Role cards ─────────────────────────────────────────── */}
      {rolesError ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          Failed to load the system agent registry: {rolesError}
        </div>
      ) : null}
      <div className="space-y-3.5">
        {roles.map((role) => {
          const overrideId =
            role.configKey != null ? overrides[role.configKey] : null;
          return (
            <AgentRoleCard
              key={role.systemAgentId}
              role={role}
              currentOverrideId={overrideId}
              isApplying={savingKey === role.configKey}
              onApply={async (candidateId) => {
                if (role.configKey) {
                  await handleApply(role.configKey, candidateId);
                }
              }}
              onRemove={async () => {
                if (role.configKey) {
                  await handleRemove(role.configKey);
                }
              }}
            />
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11.5px] text-muted-foreground/70">
        Validation checks declared variables and context slots only — it
        doesn&apos;t execute the agent.
      </p>
    </div>
  );
}
