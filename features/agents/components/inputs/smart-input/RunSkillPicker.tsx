"use client";

/**
 * RunSkillPicker — the Smart Input's Skills tab. Two stacked sections:
 *
 *   1. "This agent's skills" — the agent's REAL configured skill tiers, read
 *      live from the agentDefinition slice. Read-only here; edited in the
 *      Agent Builder via AgentSkillsModal.
 *
 *   2. "Add skills to this run" — additive registry picks stored on
 *      `builderAdvancedSettings.addedSkills`, folded into the request's
 *      `skill_config` by `buildSkillConfigForRequest`. Per-conversation,
 *      ephemeral, on TOP of the agent's own tiers (merged into `included`).
 */

import { useEffect, useState } from "react";
import {
  Search,
  X,
  Check,
  ChevronDown,
  Lightbulb,
  Sparkles,
  ListOrdered,
  EyeOff,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentSkillConfig,
  selectAgentReadyForCustomExecution,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { useSkills } from "@/features/skills/hooks/useSkills";
import type { SkillRow } from "@/features/skills/types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

type AgentSkillTier = "included" | "listed" | "forbidden";

function tierForSkill(
  skillId: string,
  config: {
    included: string[];
    listed: string[];
    forbidden: string[];
  },
): AgentSkillTier | null {
  if (config.included.includes(skillId)) return "included";
  if (config.listed.includes(skillId)) return "listed";
  if (config.forbidden.includes(skillId)) return "forbidden";
  return null;
}

const TIER_META: Record<
  AgentSkillTier,
  { icon: typeof Sparkles; label: string }
> = {
  included: { icon: Sparkles, label: "included" },
  listed: { icon: ListOrdered, label: "listed" },
  forbidden: { icon: EyeOff, label: "forbidden" },
};

export function RunSkillPicker({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  const { skills, loading } = useSkills();

  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentSkillConfig = useAppSelector((s) =>
    agentId ? selectAgentSkillConfig(s, agentId) : undefined,
  );
  const agentReady = useAppSelector((s) =>
    agentId ? selectAgentReadyForCustomExecution(s, agentId) : false,
  );

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedSkills ?? [];
  const added = new Set(addedList);
  const [search, setSearch] = useState("");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentExecutionFull(agentId));
    }
  }, [agentId, agentReady, dispatch]);

  const setAdded = (next: string[]) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedSkills: next },
      }),
    );

  const toggle = (id: string) =>
    setAdded(
      added.has(id) ? addedList.filter((s) => s !== id) : [...addedList, id],
    );

  const skillMap = new Map((skills ?? []).map((s) => [s.id, s]));
  const config = agentSkillConfig ?? {
    included: [],
    listed: [],
    forbidden: [],
    disabled: false,
  };

  const configuredIds = [
    ...config.included,
    ...config.listed,
    ...config.forbidden,
  ];
  const agentSkillCount = configuredIds.length;

  const visible = !search.trim()
    ? [
        ...skills.filter((s) => added.has(s.id)),
        ...skills.filter((s) => !added.has(s.id)),
      ]
    : filterAndSortBySearch(skills, search, [
        { get: (s) => s.label, weight: "title" },
        { get: (s) => s.description, weight: "body" },
        { get: (s) => s.skillType, weight: "tag" },
        { get: (s) => s.skillId, weight: "tag" },
      ]);

  const agentLoading = !!agentId && !agentReady;
  const skillsDisabled = config.disabled;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            This agent&apos;s skills
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {agentLoading ? "loading…" : `${agentSkillCount} configured`}
          </span>
        </div>

        <div className="max-h-40 overflow-y-auto px-2.5 pb-2">
          {agentLoading ? (
            <p className="py-1 text-[11px] text-muted-foreground">
              Loading the agent&apos;s skills…
            </p>
          ) : skillsDisabled ? (
            <p className="py-1 text-[11px] text-amber-600 dark:text-amber-400">
              Skills are disabled for this agent — nothing is injected at run
              time unless you add skills below.
            </p>
          ) : agentSkillCount === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground">
              This agent has no preconfigured skills. Others remain searchable
              via skill tools at run time.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {configuredIds.map((id) => {
                const skill = skillMap.get(id);
                const tier = tierForSkill(id, config);
                const meta = tier ? TIER_META[tier] : null;
                const TierIcon = meta?.icon ?? Lightbulb;
                return (
                  <div
                    key={id}
                    className="flex items-baseline gap-1.5 rounded bg-muted/40 px-1.5 py-0.5 text-[11px]"
                  >
                    <span className="self-center text-muted-foreground">
                      <TierIcon className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {skill?.label ?? skill?.skillId ?? id}
                    </span>
                    {meta && (
                      <span className="shrink-0 text-[9px] text-muted-foreground/70">
                        {meta.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-2 pb-1.5 pt-2">
        <p className="mb-1.5 text-[11px] leading-tight text-muted-foreground">
          Add skills to this run — merged into included on top of the
          agent&apos;s tiers.
          {added.size > 0 && (
            <span className="ml-1 font-medium text-primary">
              {added.size} added
            </span>
          )}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="h-7 pl-7 pr-7 text-xs"
            style={{ fontSize: "16px" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading && skills.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Loading skills…
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {search ? `No skills match "${search}"` : "No skills available."}
          </p>
        ) : (
          visible.map((skill) => (
            <SkillRowItem
              key={skill.id}
              skill={skill}
              selected={added.has(skill.id)}
              expanded={expandedSkillId === skill.id}
              agentTier={tierForSkill(skill.id, config)}
              onToggle={() => toggle(skill.id)}
              onToggleExpand={() =>
                setExpandedSkillId((cur) =>
                  cur === skill.id ? null : skill.id,
                )
              }
            />
          ))
        )}
      </div>

      {added.size > 0 && (
        <div className="shrink-0 border-t border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => setAdded([])}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            Clear {added.size} added skill{added.size === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

function SkillRowItem({
  skill,
  selected,
  expanded,
  agentTier,
  onToggle,
  onToggleExpand,
}: {
  skill: SkillRow;
  selected: boolean;
  expanded: boolean;
  agentTier: AgentSkillTier | null;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className={cn(selected && "bg-primary/5")}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex h-8 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-accent/60"
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="h-2.5 w-2.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {skill.label}
        </span>
        {agentTier && !selected && (
          <span className="shrink-0 text-[9px] text-muted-foreground/70">
            agent:{agentTier}
          </span>
        )}
        {skill.description && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide description" : "Show description"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {expanded && skill.description && (
        <p className="px-2.5 pb-1.5 pl-8 text-[11px] leading-snug text-muted-foreground">
          {skill.description}
        </p>
      )}
    </div>
  );
}
