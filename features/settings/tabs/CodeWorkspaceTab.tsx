"use client";

import { useEffect, useMemo } from "react";
import { Code, Filter, History, Layers } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsMultiSelect } from "@/components/official/settings/primitives/SettingsMultiSelect";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { useSetting } from "../hooks/useSetting";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllAgentCategories,
  selectAllAgentTags,
} from "@ai-matrx/agents/catalog";
import {
  useAgentCatalog,
  useAgentCatalogRows,
  useAgentCatalogState,
} from "@ai-matrx/agents/catalog/react";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import type {
  CodeAgentFilter,
  ConversationHistoryGrouping,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";
import { useActiveAgents } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";

/**
 * Settings tab for the /code workspace. Covers the agent filter that seeds
 * both the Chat picker and the History sidebar, plus defaults for the
 * history view (grouping + page size).
 */
export default function CodeWorkspaceTab() {
  const [filter, setFilter] = useSetting<CodeAgentFilter>(
    "userPreferences.coding.agentFilter",
  );
  const [grouping, setGrouping] = useSetting<ConversationHistoryGrouping>(
    "userPreferences.coding.historyGrouping",
  );
  const [pageSize, setPageSize] = useSetting<number>(
    "userPreferences.coding.historyPageSize",
  );
  const [monacoEnvironmentsEnabled, setMonacoEnvironmentsEnabled] =
    useSetting<boolean>("userPreferences.coding.monacoEnvironmentsEnabled");

  const agentRows = useAgentCatalogRows();
  // The catalogue read behind the tag/category options (RC-B12): "No tags on
  // your agents yet" is only true after it succeeded.
  const catalog = useAgentCatalog();
  const catalogStatus = useAgentCatalogState((s) => s.status);
  const catalogError = useAgentCatalogState((s) => s.error);
  const catalogFailed = catalogStatus === "failed";
  const catalogLoaded = catalogStatus === "succeeded";
  // A failed load lands in the catalogue's own status/error (shown below), so
  // the promise's rejection carries nothing more to say.
  const retryCatalog = () => {
    catalog.ensureLoaded({ force: true }).catch(() => undefined);
  };
  useEffect(() => {
    catalog.ensureLoaded().catch(() => undefined);
  }, [catalog]);
  const allTags = selectAllAgentTags(agentRows);
  const allCategories = selectAllAgentCategories(agentRows);
  const allAgents = useActiveAgents();

  const tagOptions = useMemo(
    () => allTags.map((t) => ({ value: t, label: t })),
    [allTags],
  );
  const categoryOptions = useMemo(
    () => allCategories.map((c) => ({ value: c, label: c })),
    [allCategories],
  );
  const agentOptions = useMemo(
    () =>
      allAgents.map((a) => ({
        value: a.id,
        label: a.name || a.id.slice(0, 8),
      })),
    [allAgents],
  );

  // Typed patchers — `setFilter` accepts a whole `CodeAgentFilter`, so we
  // clone + patch to keep unrelated fields untouched.
  const patchFilter = (patch: Partial<CodeAgentFilter>) => {
    setFilter({ ...filter, ...patch });
  };

  return (
    <>
      <SettingsSubHeader
        title="Code workspace"
        description="Control which agents appear in the /code chat and which conversations populate the history sidebar."
        icon={Code}
      />

      <PreferencesLoadGate what="your code workspace settings">
        <SettingsSection title="Agent filter" icon={Filter}>
          <SettingsSegmented<CodeAgentFilter["mode"]>
            label="Which agents should appear?"
            description="Applies to the chat picker and history sidebar."
            helpText="Users can always clear this filter in the picker."
            value={filter.mode}
            onValueChange={(mode) => patchFilter({ mode })}
            options={[
              { value: "all", label: "All" },
              { value: "tags", label: "By tag" },
              { value: "categories", label: "By category" },
              { value: "favorites", label: "Favorites" },
              { value: "explicit", label: "Specific" },
            ]}
          />

          {catalogFailed &&
            (filter.mode === "tags" || filter.mode === "categories") && (
              <ReadFailure
                error={catalogError ?? true}
                what="your agents' tags and categories"
                onRetry={retryCatalog}
              />
            )}

          {filter.mode === "tags" && (
            <SettingsMultiSelect<string>
              label="Tags"
              description="Show agents that have at least one of these tags."
              value={filter.tags}
              onValueChange={(tags) => patchFilter({ tags })}
              options={tagOptions}
              placeholder={
                tagOptions.length > 0
                  ? "Pick tags"
                  : catalogFailed
                    ? "Your agents could not be read"
                    : !catalogLoaded
                      ? "Loading your agents…"
                      : "No tags on your agents yet"
              }
            />
          )}

          {filter.mode === "categories" && (
            <SettingsMultiSelect<string>
              label="Categories"
              description="Show agents whose category matches one of these."
              value={filter.categories}
              onValueChange={(categories) => patchFilter({ categories })}
              options={categoryOptions}
              placeholder={
                categoryOptions.length > 0
                  ? "Pick categories"
                  : catalogFailed
                    ? "Your agents could not be read"
                    : !catalogLoaded
                      ? "Loading your agents…"
                      : "No categories on your agents yet"
              }
            />
          )}

          {filter.mode === "explicit" && (
            <SettingsMultiSelect<string>
              label="Agents"
              description="Only these agents will show up."
              value={filter.agentIds}
              onValueChange={(agentIds) => patchFilter({ agentIds })}
              options={agentOptions}
              placeholder="Pick agents"
              countOnly={agentOptions.length > 30}
              last
            />
          )}

          {filter.mode === "favorites" && (
            <SettingsCallout tone="info">
              Any agent marked as a favorite will show up here. Star an agent from
              its settings or the agents grid to add it.
            </SettingsCallout>
          )}

          {filter.mode === "all" && (
            <SettingsCallout tone="info">
              No filter is active — every agent you can access will appear in the
              /code chat.
            </SettingsCallout>
          )}
        </SettingsSection>

        <SettingsSection title="History sidebar" icon={History}>
          <SettingsSegmented<ConversationHistoryGrouping>
            label="Default grouping"
            description="How history groups conversations on first load."
            value={grouping}
            onValueChange={setGrouping}
            options={[
              { value: "date", label: "By date" },
              { value: "agent", label: "By agent" },
            ]}
          />
          <SettingsNumberInput
            label="Conversations per page"
            description="Conversations loaded per batch."
            value={pageSize}
            onValueChange={setPageSize}
            min={10}
            max={100}
            step={5}
            last
          />
        </SettingsSection>

        <SettingsSection title="Editor type environments" icon={Layers}>
          {/* Curated React/Lucide/shadcn/Node typings for the prompt-app,
              aga-app, tool-ui and sandbox tabs. */}
          <SettingsSwitch
            label="Load per-tab type definitions"
            description="Typings for React, Lucide, shadcn and Node in code tabs."
            helpText="Turn off to see plain TypeScript errors instead."
            checked={monacoEnvironmentsEnabled ?? true}
            onCheckedChange={setMonacoEnvironmentsEnabled}
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>

      <SettingsCallout tone="info">
        The /code workspace is designed for working with a focused set of coding
        agents rather than every agent you own. Use tags like{" "}
        <span className="font-mono">code</span>,{" "}
        <span className="font-mono">refactor</span>, or{" "}
        <span className="font-mono">debug</span> on your coding agents to narrow
        the roster quickly.
      </SettingsCallout>
    </>
  );
}
