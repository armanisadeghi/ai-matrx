/** Compatibility names for existing groomer callers; behavior is package-owned. */
export {
  GROOMER_LEVELS,
  applyGroomerPreset,
  buildGroomerPresetPayload,
  defaultGroomerSelections,
  groomerPresetVariants,
  type AlchemyDetail as GroomerLevel,
  type AlchemyGroomerPreset as GroomerPreset,
  type AlchemyGroomerSection as AgentCopyGroomerSection,
  type AlchemyGroomerConfig as AgentCopyGroomerConfig,
} from "@ai-matrx/alchemy/react/workspace";

export type GroomerSelection =
  import("@ai-matrx/alchemy/react/workspace").AlchemyDetail | "off";
