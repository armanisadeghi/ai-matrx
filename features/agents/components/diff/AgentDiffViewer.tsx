"use client";

import { useMemo } from "react";
import { createAdapterRegistry } from "@/components/diff/adapters/registry";
import { DiffViewerShell } from "@/components/diff/views/DiffViewerShell";
import {
  TextFieldAdapter,
  BooleanFieldAdapter,
  TagsFieldAdapter,
  JsonObjectAdapter,
  KeyValueAdapter,
} from "@/components/diff/adapters/defaults";
import type {
  DiffTemporalMetadata,
  ViewMode,
} from "@/components/diff/engine/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { useDiffEnrichment } from "@/features/agents/hooks/useDiffEnrichment";
import { compareAgentDefinitions } from "./compare-agent-definitions";

import { MessagesAdapter } from "./adapters/MessagesAdapter";
import { ModelAdapter } from "./adapters/ModelAdapter";
import { ToolsAdapter } from "./adapters/ToolsAdapter";
import { SettingsAdapter } from "./adapters/SettingsAdapter";
import { VariablesAdapter } from "./adapters/VariablesAdapter";
import { ContextPoliciesAdapter } from "./adapters/ContextPoliciesAdapter";
import { CustomToolsAdapter } from "./adapters/CustomToolsAdapter";
import { McpServersAdapter } from "./adapters/McpServersAdapter";
import { ModelTiersAdapter } from "./adapters/ModelTiersAdapter";

interface AgentDiffViewerProps {
  oldAgent: Partial<AgentDefinition>;
  newAgent: Partial<AgentDefinition>;
  oldLabel: string;
  newLabel: string;
  temporalMetadata?: DiffTemporalMetadata;
  defaultMode?: ViewMode;
  className?: string;
}

/**
 * The canonical agent field-adapter registry. Exported so the diff PAGE can
 * name and describe changed fields exactly as this viewer renders them when it
 * builds a Copy-for-AI payload — one registry, never a parallel label table.
 */
export function buildAgentAdapterRegistry() {
  const registry = createAdapterRegistry();

  // Complex structured fields
  registry.register("messages", MessagesAdapter);
  registry.register("modelId", ModelAdapter);
  registry.register("tools", ToolsAdapter);
  registry.register("settings", SettingsAdapter);
  registry.register("variableDefinitions", VariablesAdapter);
  registry.register("contextPolicies", ContextPoliciesAdapter);
  registry.register("customTools", CustomToolsAdapter);
  registry.register("mcpServers", McpServersAdapter);

  // Simple fields
  registry.register("name", { ...TextFieldAdapter, label: "Name" });
  registry.register("description", {
    ...TextFieldAdapter,
    label: "Description",
  });
  registry.register("category", { ...TextFieldAdapter, label: "Category" });
  registry.register("tags", { ...TagsFieldAdapter, label: "Tags" });
  registry.register("isActive", { ...BooleanFieldAdapter, label: "Active" });
  registry.register("isArchived", {
    ...BooleanFieldAdapter,
    label: "Archived",
  });
  registry.register("isFavorite", {
    ...BooleanFieldAdapter,
    label: "Favorite",
  });
  registry.register("autoToolsDisabled", {
    ...BooleanFieldAdapter,
    label: "Automatic Tool Injection Disabled",
  });
  registry.register("version", { ...TextFieldAdapter, label: "Version" });
  registry.register("changeNote", {
    ...TextFieldAdapter,
    label: "Change Note",
  });
  registry.register("defaultRagBoost", {
    ...TextFieldAdapter,
    label: "Default Knowledge Boost",
  });
  registry.register("ragAwarenessMode", {
    ...TextFieldAdapter,
    label: "Knowledge Awareness Mode",
  });

  // JSON fields
  registry.register("modelTiers", ModelTiersAdapter);
  registry.register("outputSchema", {
    ...JsonObjectAdapter,
    label: "Output Schema",
  });
  registry.register("skillConfig", {
    ...JsonObjectAdapter,
    label: "Skill Configuration",
  });
  registry.register("uiGates", {
    ...JsonObjectAdapter,
    label: "UI Gates",
  });
  registry.register("matrxDirectives", {
    ...JsonObjectAdapter,
    label: "Matrx Directives",
  });

  return registry;
}

export function AgentDiffViewer({
  oldAgent,
  newAgent,
  oldLabel,
  newLabel,
  temporalMetadata,
  defaultMode = "changes-only",
  className,
}: AgentDiffViewerProps) {
  const enrichment = useDiffEnrichment();
  const adapters = useMemo(() => buildAgentAdapterRegistry(), []);

  const diffResult = useMemo(
    () => compareAgentDefinitions(oldAgent, newAgent).diffResult,
    [oldAgent, newAgent],
  );

  return (
    <DiffViewerShell
      diffResult={diffResult}
      oldValue={oldAgent}
      newValue={newAgent}
      oldLabel={oldLabel}
      newLabel={newLabel}
      adapters={adapters}
      enrichment={enrichment}
      temporalMetadata={temporalMetadata}
      defaultMode={defaultMode}
      className={className}
    />
  );
}
