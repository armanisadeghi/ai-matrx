/**
 * Functionality Helpers - STUBBED
 *
 * The tables `system_prompt_functionality_configs` and `system_prompt_categories`
 * no longer exist. These functions are stubbed to prevent build errors.
 * If any of these are called at runtime, a loud warning will be logged.
 *
 * TODO: Remove stubs and re-implement once replacement tables/schema are ready.
 */

// Stub shape — the backing tables no longer exist, so no row is ever produced;
// this documents the fields callers historically read from a functionality
// config (label/description/variables) rather than propagating `any`.
export interface FunctionalityConfig {
  name?: string;
  label?: string;
  description?: string;
  required_variables?: string[];
  optional_variables?: string[];
  requiredVariables?: string[];
}

const STUB_WARN = (fn: string, args: Record<string, unknown>) => {
  console.warn(
    `%c[STUB CALLED] ${fn}`,
    "color: orange; font-weight: bold; font-size: 14px",
    "\n⚠️  Tables system_prompt_functionality_configs / system_prompt_categories no longer exist.",
    "\n⚠️  This function is a stub and returned empty/null data.",
    "\n⚠️  Callers of this function need to be updated.",
    "\nArgs:",
    args,
    "\nStack:",
    new Error().stack,
  );
};

/**
 * @deprecated Tables system_prompt_functionality_configs / system_prompt_categories no longer exist.
 * This is a stub that returns null and logs a loud runtime warning. Do not use — update the caller.
 */
export async function getFunctionalityById(
  functionalityId: string,
): Promise<FunctionalityConfig | null> {
  STUB_WARN("getFunctionalityById", { functionalityId });
  return null;
}

/**
 * @deprecated Tables system_prompt_functionality_configs / system_prompt_categories no longer exist.
 * This is a stub that returns [] and logs a loud runtime warning. Do not use — update the caller.
 */
export async function getAllFunctionalities(
  activeOnly: boolean = true,
): Promise<FunctionalityConfig[]> {
  STUB_WARN("getAllFunctionalities", { activeOnly });
  return [];
}

/**
 * @deprecated Tables system_prompt_functionality_configs / system_prompt_categories no longer exist.
 * This is a stub that returns [] and logs a loud runtime warning. Do not use — update the caller.
 */
export async function getFunctionalitiesByPlacementType(
  placementType: string,
  activeOnly: boolean = true,
): Promise<FunctionalityConfig[]> {
  STUB_WARN("getFunctionalitiesByPlacementType", { placementType, activeOnly });
  return [];
}

export interface BasePromptMessage {
  role?: string;
  content?: string;
}

export interface BasePromptSnapshot {
  messages?: BasePromptMessage[];
  [key: string]: unknown;
}

/**
 * Extract variables from prompt snapshot
 */
export function extractVariablesFromPrompt(promptSnapshot: BasePromptSnapshot): string[] {
  const variables = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

  promptSnapshot.messages?.forEach((msg) => {
    if (msg.content) {
      let match;
      while ((match = regex.exec(msg.content)) !== null) {
        variables.add(match[1]);
      }
    }
  });

  return Array.from(variables);
}
