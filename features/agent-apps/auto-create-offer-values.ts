/**
 * Declared offer values for the two Auto Create runs.
 *
 * The auto-create form launches two mandates (both on the MANDATE door via
 * `executeBuiltinWith*Extraction` → `launchAgentExecution({ mandateKey })`):
 *
 *   - `agent_apps.metadata`            ← provision `agent_apps.metadata_request`
 *   - `agent_apps.auto_create[_lightning]` ← provision `agent_apps.auto_create_request`
 *
 * Beside the rendered by-name variables they already send, each run now also
 * sends its provision's mapped-only values by name. The server drops a
 * mapped-only value unless a binding's consumption map names it, so what the
 * current Holders receive is unchanged. Every value is a fact the form or the
 * hook already holds; an absent fact omits its key (never "" or null).
 */

import type {
  AgentAppsAutoCreateRequestOffer,
  AgentAppsMetadataRequestOffer,
} from "@/types/python-generated/provision-offers";
import type { DisplayMode, FormatType, ResponseMode } from "./config-instructions";
import type { AppMetadata } from "./types";

type AutoCreateFormOffer = Pick<
  Partial<AgentAppsAutoCreateRequestOffer>,
  | "page_layout"
  | "display_mode"
  | "response_mode"
  | "primary_color"
  | "included_variable_names"
  | "creator_instructions"
  | "creation_mode"
  | "agent_id"
  | "agent_name"
>;

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function agentVariableNames(agent: unknown): string[] {
  if (!agent || typeof agent !== "object") return [];
  const row = agent as { variable_definitions?: unknown; variable_defaults?: unknown };
  const defs = Array.isArray(row.variable_definitions)
    ? row.variable_definitions
    : Array.isArray(row.variable_defaults)
      ? row.variable_defaults
      : [];
  return defs
    .map((d: unknown) => (d && typeof d === "object" ? (d as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

/** The choices the form made, as the raw facts behind the rendered strings. */
export function buildAutoCreateFormOffer(input: {
  agent: unknown;
  format: FormatType;
  displayMode: DisplayMode;
  responseMode: ResponseMode;
  /** Per-variable include toggles; `{}` means every agent input is included. */
  includedVariables: Record<string, boolean>;
  colorMode: "auto" | "custom";
  primaryColor?: string;
  /** Exactly what the creator typed — never the generator contract. */
  creatorInstructions?: string;
  /** The form's creation mode; only "select" and "describe" are creator choices. */
  creationMode?: string;
}): AutoCreateFormOffer {
  const agent = (input.agent ?? {}) as { id?: unknown; name?: unknown };
  const includedNames = agentVariableNames(input.agent).filter(
    (name) => input.includedVariables[name] !== false,
  );
  const creatorInstructions = nonEmpty(input.creatorInstructions);
  const primaryColor =
    input.colorMode === "custom" ? nonEmpty(input.primaryColor) : undefined;
  const agentId = nonEmpty(agent.id);
  const agentName = nonEmpty(agent.name);
  return {
    page_layout: input.format,
    display_mode: input.displayMode,
    response_mode: input.responseMode,
    ...(primaryColor ? { primary_color: primaryColor } : {}),
    included_variable_names: includedNames,
    ...(creatorInstructions ? { creator_instructions: creatorInstructions } : {}),
    ...(input.creationMode === "select" || input.creationMode === "describe"
      ? { creation_mode: input.creationMode }
      : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
  } satisfies Partial<AgentAppsAutoCreateRequestOffer>;
}

/** Variables for the metadata run: the existing `prompt_config` plus offers. */
export function buildMetadataRunVariables(input: {
  promptConfig: string;
  agent: unknown;
  pageLayoutFormat: string;
  responseDisplayMode: string;
  creatorInstructions?: string;
  builderMode: "standard" | "lightning";
}): Record<string, unknown> {
  const agent = (input.agent ?? {}) as { name?: unknown; description?: unknown };
  const agentName = nonEmpty(agent.name);
  const agentDescription = nonEmpty(agent.description);
  const creatorInstructions = nonEmpty(input.creatorInstructions);
  const offer = {
    ...(agentName ? { agent_name: agentName } : {}),
    ...(agentDescription ? { agent_description: agentDescription } : {}),
    agent_variable_names: agentVariableNames(input.agent),
    page_layout_format: input.pageLayoutFormat,
    response_display_mode: input.responseDisplayMode,
    ...(creatorInstructions ? { custom_instructions: creatorInstructions } : {}),
    builder_mode: input.builderMode,
  } satisfies Partial<AgentAppsMetadataRequestOffer>;
  return { prompt_config: input.promptConfig, ...offer };
}

/** Variables for the code run: the existing rendered set plus offers. */
export function buildCodeRunVariables(input: {
  builtinVariables: Record<string, string>;
  formOffer?: AutoCreateFormOffer;
  builderMode: "standard" | "lightning";
  metadata: AppMetadata;
  slug: string;
}): Record<string, unknown> {
  const { metadata } = input;
  const offer = {
    ...(input.formOffer ?? {}),
    builder_mode: input.builderMode,
    ...(nonEmpty(metadata.name) ? { app_name: metadata.name } : {}),
    ...(nonEmpty(metadata.tagline) ? { app_tagline: metadata.tagline } : {}),
    ...(nonEmpty(metadata.description) ? { app_description: metadata.description } : {}),
    ...(nonEmpty(metadata.category) ? { app_category: metadata.category as string } : {}),
    ...(nonEmpty(input.slug) ? { app_slug: input.slug } : {}),
  } satisfies Partial<AgentAppsAutoCreateRequestOffer>;
  // Existing by-name values win on any overlap (there is none by design).
  return { ...offer, ...input.builtinVariables };
}

export type { AutoCreateFormOffer };
