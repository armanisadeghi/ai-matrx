import {
    candidateProfileConfig,
    candidateProfileStructuredConfig,
    candidateProfileTextConfig,
    appSuggestionsConfig,
    googleSeoConfig,
} from "./configs";
import type { MarkdownConfig } from "./config-processor";
import { BREAKING_CONFIGS } from "../combined-processor-config-system/configs";
import type { BreakConfig } from "../combined-processor-config-system/break-config-processor";
import { STRUCTURED_CONFIGS } from "../structured-ast-config-system/configs";
import type { StructuredConfig } from "../structured-ast-config-system/structured-ast-processor";

// The registry is intentionally heterogeneous: each processorType carries a
// structurally different config shape, discriminated at use by
// `PROCESSOR_CONFIG_TYPE_MAP` / the processor that consumes it.
type JsonProcessorConfig = MarkdownConfig | BreakConfig[] | StructuredConfig | Record<string, never>;

interface JsonProcessorConfigDefinition {
    id: string;
    name: string;
    type: string;
    config: JsonProcessorConfig;
    description: string;
    processorType: "jsonConfig" | "breakConfig" | "noConfig" | "structuredAst";
}

// Individual definitions
const CANDIDATE_PROFILE_DEFINITION: JsonProcessorConfigDefinition = {
    id: "candidateProfile",
    name: "Candidate Profile",
    type: "candidate_profile",
    processorType: "jsonConfig",
    config: candidateProfileConfig,
    description: "Standard configuration for parsing candidate profiles",
};

const CANDIDATE_PROFILE_STRUCTURED_DEFINITION: JsonProcessorConfigDefinition = {
    id: "candidateProfileStructured",
    name: "Candidate Profile Structured",
    type: "candidate_profile_structured",
    processorType: "jsonConfig",
    config: candidateProfileStructuredConfig,
    description: "Configuration for parsing structured candidate profiles",
};

const CANDIDATE_PROFILE_TEXT_DEFINITION: JsonProcessorConfigDefinition = {
    id: "candidateProfileText",
    name: "Candidate Profile Text",
    type: "candidate_profile_text",
    processorType: "jsonConfig",
    config: candidateProfileTextConfig,
    description: "Configuration for parsing candidate profiles as text",
};

const APP_SUGGESTIONS_DEFINITION: JsonProcessorConfigDefinition = {
    id: "appSuggestions",
    name: "App Suggestions",
    type: "app_suggestions",
    processorType: "jsonConfig",
    config: appSuggestionsConfig,
    description: "Configuration for parsing app suggestions",
};

const GOOGLE_SEO_DEFINITION: JsonProcessorConfigDefinition = {
    id: "googleSeo",
    name: "Google SEO",
    type: "google_seo",
    processorType: "jsonConfig",
    config: googleSeoConfig,
    description: "Configuration for parsing Google SEO tips",
};

const NO_CONFIG_DEFINITION: JsonProcessorConfigDefinition = {
    id: "noConfig",
    name: "No Config",
    type: "no_config",
    processorType: "noConfig",
    config: {},
    description: "No configuration",
};

// Registry array
export const JSON_CONFIG_SYSTEM_REGISTRY = [
    CANDIDATE_PROFILE_DEFINITION,
    CANDIDATE_PROFILE_STRUCTURED_DEFINITION,
    CANDIDATE_PROFILE_TEXT_DEFINITION,
    APP_SUGGESTIONS_DEFINITION,
    GOOGLE_SEO_DEFINITION,
    NO_CONFIG_DEFINITION,
    ...BREAKING_CONFIGS,
    ...STRUCTURED_CONFIGS,
];

// Utility functions
export const getConfigSelectOptions = () => {
    return JSON_CONFIG_SYSTEM_REGISTRY.map((config) => ({
        value: config.id,
        label: config.name,
        description: config.description,
        processorType: config.processorType,
    }));
};

export const getConfigEntry = (configId: string) => {
    return JSON_CONFIG_SYSTEM_REGISTRY.find((c) => c.id === configId) || null;
};

export const hasConfig = (configId: string) => {
    return JSON_CONFIG_SYSTEM_REGISTRY.some((c) => c.id === configId);
};

export const getConfigObject = (configId: string) => {
    const configEntry = getConfigEntry(configId);
    if (!configEntry) return {};
    return configEntry.config;
};
