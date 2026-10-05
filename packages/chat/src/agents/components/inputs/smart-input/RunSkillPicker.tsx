"use client";

/**
 * RunSkillPicker — THE Skills surface for one conversation, on the shared
 * two-list `RunPicksSurface` (the same layout RunToolPicker uses):
 *
 *   1. This agent's skills — the agent's REAL configured skill tiers
 *      (included / listed / forbidden), read live from the agentDefinition
 *      slice. Read-only here; edited in the Agent Builder's Agent Skills
 *      window. Above them, the skills added for this run, each removable.
 *   2. Add skills — the registry, grouped by type, searchable; one click adds
 *      to (or removes from) `builderAdvancedSettings.addedSkills`, folded into
 *      the request's `skill_config.included` by `buildSkillConfigForRequest`
 *      on TOP of the agent's own tiers. A skill the agent already lists or
 *      forbids stays addable (adding promotes it to included for this run).
 *      Same state the Quickset ShapeChipsRow toggles — keep them consistent.
 */

import { UntrustedCount } from "@ai-matrx/chat/host/ui-slots";
import { readOf } from "@ai-matrx/chat/host/ui-slots";
import { useEffect } from "react";
import { Lightbulb, CheckCircle2, ListOrdered, EyeOff } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { EntityRef } from "@ai-matrx/chat/host/ui-slots";
import { PickerEmpty } from "@ai-matrx/chat/utils/resource-picker/ResourcePickerSubViewHeader";
import { selectAgentIdFromInstance } from "../../../redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentError,
  selectAgentSkillConfig,
  selectAgentRunControlsReady,
} from "../../../redux/agent-definition/selectors";
import { fetchAgentRunControls } from "../../../redux/agent-definition/thunks";
import { selectBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "../../../types/instance.types";
import { useSkills } from "@ai-matrx/chat/host/ui-slots";
import { ReadFailure } from "@ai-matrx/chat/host/ui-slots";
import type { SkillRow } from "@ai-matrx/chat/ui/skills-types";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import {
  RunPicksSurface,
  PicksLine,
  PicksNote,
  PicksNotice,
  PicksSkeletons,
  type PicksCatalogItem,
} from "./RunPicksSurface";
import { groupCatalog, toolCategoryLabel } from "./run-tool-catalog";
import { catalogProseText } from "../../../../utils/content-ir/surfaces/kind-one-line";

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
  { icon: typeof ListOrdered; label: string }
> = {
  included: { icon: CheckCircle2, label: "Included" },
  listed: { icon: ListOrdered, label: "Listed" },
  forbidden: { icon: EyeOff, label: "Forbidden" },
};

export function RunSkillPicker({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const {
    skills,
    loading,
    error: skillsError,
    reload: reloadSkills,
  } = useSkills();

  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentSkillConfig = useAppSelector((s) =>
    agentId ? selectAgentSkillConfig(s, agentId) : undefined,
  );
  const agentReadError = useAppSelector((s) =>
    agentId ? selectAgentError(s, agentId) : null,
  );
  const agentReady = useAppSelector((s) =>
    agentId ? selectAgentRunControlsReady(s, agentId) : false,
  );

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedSkills ?? [];
  const added = new Set(addedList);

  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentRunControls(agentId));
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

  const list = skills ?? [];
  const skillMap = new Map(list.map((s) => [s.id, s]));
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
  const agentLoading = !!agentId && !agentReady;
  const skillsDisabled = config.disabled;

  const toItem = (skill: SkillRow): PicksCatalogItem => {
    const tier = tierForSkill(skill.id, config);
    return {
      id: skill.id,
      label: skill.label,
      secondary: catalogProseText(skill.description) || undefined,
      title: catalogProseText(skill.description) || undefined,
      note: tier ? TIER_META[tier].label : undefined,
    };
  };
  const groups = groupCatalog(
    list,
    (s) => s.skillType,
    (s) => s.label,
  ).map((g) => ({ label: g.label, items: g.items.map(toItem) }));
  const searchCatalog = (query: string) =>
    filterAndSortBySearch(list, query, [
      { get: (s) => s.label, weight: "title" },
      { get: (s) => s.description, weight: "body" },
      { get: (s) => s.skillType, weight: "tag" },
      { get: (s) => s.skillId, weight: "tag" },
    ]).map(toItem);

  const agentSection = !agentId ? (
    <PickerEmpty>No agent on this chat</PickerEmpty>
  ) : agentReadError ? (
    <ReadFailure
      error={agentReadError}
      what="this agent's skills"
      size="compact"
      className="m-1.5"
      onRetry={() => void dispatch(fetchAgentRunControls(agentId))}
    />
  ) : agentLoading ? (
    <PicksSkeletons />
  ) : agentSkillCount === 0 ? (
    <PicksNote>No preset skills</PicksNote>
  ) : (
    <div className="flex flex-col">
      {configuredIds.map((id) => {
        const skill = skillMap.get(id);
        const tier = tierForSkill(id, config);
        const meta = tier ? TIER_META[tier] : null;
        return (
          <PicksLine
            key={id}
            icon={meta?.icon ?? Lightbulb}
            label={
              <EntityRef
                token="skill"
                id={id}
                name={skill?.label ?? skill?.skillId ?? id}
                showIcon={false}
                fill
                className="min-w-0 text-sm text-foreground"
              />
            }
            detail={meta?.label}
            title={catalogProseText(skill?.description) || undefined}
          />
        );
      })}
    </div>
  );

  return (
    <RunPicksSurface
      noun="skills"
      icon={Lightbulb}
      notice={
        skillsDisabled ? (
          <PicksNotice icon={EyeOff}>Skills are off for this agent</PicksNotice>
        ) : null
      }
      agentCount={
        <UntrustedCount
          read={readOf({ isLoading: agentLoading, error: agentReadError })}
          value={agentSkillCount}
          label="This agent's skills"
        />
      }
      agentSection={agentSection}
      added={addedList.map((id) => {
        const skill = skillMap.get(id);
        return {
          id,
          label: skill?.label ?? id,
          secondary: skill ? toolCategoryLabel(skill.skillType) : undefined,
        };
      })}
      onToggle={toggle}
      onClear={() => setAdded([])}
      catalogSize={list.length}
      groups={groups}
      searchCatalog={searchCatalog}
      catalogState={
        loading && list.length === 0 ? (
          <PicksSkeletons />
        ) : skillsError && list.length === 0 ? (
          <ReadFailure
            error={skillsError}
            what="the skills"
            className="m-2"
            onRetry={() => void reloadSkills()}
          />
        ) : undefined
      }
    />
  );
}
