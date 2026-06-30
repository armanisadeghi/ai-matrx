import { getProcessorEntry, hasProcessor } from "./processors/processor-registry";
import { getConfigEntry, hasConfig } from "./processors/json-config-system/config-registry";
import { getViewComponent as getViewComponentFromRegistry, ViewId } from "./custom-views/view-registry";

export interface CoordinatorDefinition {
    id: string;
    label: string;
    description: string;
    rawProcessor: string;
    processor: string;
    config: string | null;
    defaultView: ViewId;
    availableViews: ViewId[];
    sampleData: string[];
}

const CANDIDATE_PROFILE_DEFINITION: CoordinatorDefinition = {
    id: "candidate_profile",
    label: "Candidate Profile",
    description: "Standard configuration for parsing candidate profiles",
    rawProcessor: "ast",
    processor: "ast-to-json-with-config",
    config: "candidateProfile",
    defaultView: "candidateProfile",
    availableViews: [
        "candidateProfile",
        "candidateProfileCollapsible",
        "modernCandidateProfile",
        "modernOneColumnCandidateProfile",
        "dynamic",
    ],
    sampleData: ["candidateProfileShort", "candidateProfileFull"],
};

const MODERN_CANDIDATE_PROFILE_DEFINITION: CoordinatorDefinition = {
    id: "modern_candidate_profile",
    label: "Modern Candidate Profile",
    description: "Modern configuration for parsing candidate profiles",
    rawProcessor: "ast",
    processor: "ast-to-json-with-config",
    config: "candidateProfile",
    defaultView: "modernCandidateProfile",
    availableViews: [
        "candidateProfile",
        "candidateProfileCollapsible",
        "modernCandidateProfile",
        "modernOneColumnCandidateProfile",
        "dynamic",
    ],
    sampleData: ["candidateProfileShort", "candidateProfileFull"],
};


const CANDIDATE_PROFILE_STRUCTURED_DEFINITION: CoordinatorDefinition = {
    id: "candidate_profile_structured",
    label: "Candidate Profile Structured",
    description: "Configuration for parsing structured candidate profiles",
    rawProcessor: "ast",
    processor: "ast-to-json-with-config",
    config: "candidateProfileStructured",
    defaultView: "modernCandidateProfile",
    availableViews: [
        "candidateProfile",
        "candidateProfileCollapsible",
        "modernCandidateProfile",
        "modernOneColumnCandidateProfile",
        "dynamic",
    ],
    sampleData: ["candidateProfileStructured"],
};

const CANDIDATE_PROFILE_TEXT_DEFINITION: CoordinatorDefinition = {
    id: "candidate_profile_text",
    label: "Candidate Profile Text",
    description: "Configuration for parsing candidate profiles as text",
    rawProcessor: "ast",
    processor: "ast-to-json-with-config",
    config: "candidateProfileText",
    defaultView: "modernCandidateProfile",
    availableViews: [
        "candidateProfile",
        "candidateProfileCollapsible",
        "modernCandidateProfile",
        "modernOneColumnCandidateProfile",
        "dynamic",
    ],
    sampleData: ["candidateProfileLimitedMarkdown"],
};

const APP_SUGGESTIONS_DEFINITION: CoordinatorDefinition = {
    id: "app_suggestions",
    label: "App Suggestions",
    description: "Configuration for parsing app suggestions",
    rawProcessor: "ast",
    processor: "ast-to-json-with-config",
    config: "appSuggestions",
    defaultView: "appSuggestions",
    availableViews: ["appSuggestions", "dynamic"],
    sampleData: ["appSuggestions"],
};

const GOOGLE_SEO_DEFINITION: CoordinatorDefinition = {
    id: "google_seo",
    label: "Google SEO",
    description: "Configuration for parsing Google SEO tips",
    rawProcessor: "ast",
    processor: "intro-outro-list",
    config: null,
    defaultView: "introOutroList",
    availableViews: ["introOutroList", "keyPoints", "dynamic"],
    sampleData: ["googleSampleShort", "googleSampleLong"],
};

const CLAUDE_SEO_DEFINITION: CoordinatorDefinition = {
    id: "claude_seo",
    label: "Claude SEO",
    description: "Configuration for parsing Claude SEO tips",
    rawProcessor: "ast",
    processor: "intro-outro-list",
    config: null,
    defaultView: "keyPoints",
    availableViews: ["introOutroList", "keyPoints", "dynamic"],
    sampleData: ["claudeSample"],
};

const GROK_SEO_DEFINITION: CoordinatorDefinition = {
    id: "grok_seo",
    label: "Grok SEO",
    description: "Configuration for parsing Grok SEO tips",
    rawProcessor: "ast",
    processor: "intro-outro-nested-list",
    config: null,
    defaultView: "introOutroList",
    availableViews: ["introOutroList", "keyPointsNestedList", "keyPoints", "dynamic"],
    sampleData: ["grokSample"],
};

const GPT_SEO_DEFINITION: CoordinatorDefinition = {
    id: "gpt_seo",
    label: "GPT SEO",
    description: "Configuration for parsing GPT SEO tips",
    rawProcessor: "ast",
    processor: "heading-list",
    config: null,
    defaultView: "keyPoints",
    availableViews: ["keyPointsNestedList", "keyPoints", "dynamic"],
    sampleData: ["gptSample"],
};

const SECTIONED_LIST_DEFINITION: CoordinatorDefinition = {
    id: "gpt_sectioned_list",
    label: "GPT Sectioned List",
    description: "Configuration for parsing GPT sectioned lists",
    rawProcessor: "ast",
    processor: "sectioned-list",
    config: null,
    defaultView: "travelGuide",
    availableViews: ["travelGuide", "introOutroList", "keyPointsNestedList", "keyPoints", "dynamic"],
    sampleData: ["gptSectionedList"],
};

const DYNAMIC_DEFINITION: CoordinatorDefinition = {
    id: "dynamic",
    label: "Dynamic",
    description: "Dynamic configuration for parsing markdown",
    rawProcessor: "ast",
    processor: "combined-processor",
    config: null,
    defaultView: "dynamic",
    availableViews: [
        "dynamic",
        "candidateProfile",
        "candidateProfileCollapsible",
        "modernCandidateProfile",
        "modernOneColumnCandidateProfile",
        "appSuggestions",
        "introOutroList",
        "keyPointsNestedList",
        "keyPoints",
        "travelGuide",
    ],
    sampleData: ["appDescription"],
};

const LSI_KEYWORDS_DEFINITION: CoordinatorDefinition = {
    id: "lsi_keywords",
    label: "LSI Keywords",
    description: "Configuration for parsing LSI keywords",
    rawProcessor: "ast",
    processor: "combined-processor",
    config: null,
    defaultView: "modernKeywordAnalyzer",
    availableViews: [
        "modernKeywordAnalyzer",
    ],
    sampleData: ["lsiKeywords"],
};

const KEYWORD_HIERARCHY_DEFINITION: CoordinatorDefinition = {
    id: "keyword_hierarchy",
    label: "Keyword Hierarchy",
    description: "Configuration for parsing keyword hierarchy",
    rawProcessor: "ast",
    processor: "combined-processor",
    config: null,
    defaultView: "keywordHierarchy",
    availableViews: ["keywordHierarchy"],
    sampleData: ["lsiKeywords"],
};


const COORDINATOR_DEFINITIONS = [
    CANDIDATE_PROFILE_DEFINITION,
    CANDIDATE_PROFILE_STRUCTURED_DEFINITION,
    CANDIDATE_PROFILE_TEXT_DEFINITION,
    APP_SUGGESTIONS_DEFINITION,
    GOOGLE_SEO_DEFINITION,
    CLAUDE_SEO_DEFINITION,
    GROK_SEO_DEFINITION,
    GPT_SEO_DEFINITION,
    SECTIONED_LIST_DEFINITION,
    DYNAMIC_DEFINITION,
    MODERN_CANDIDATE_PROFILE_DEFINITION,
    LSI_KEYWORDS_DEFINITION,
    KEYWORD_HIERARCHY_DEFINITION,
];

export const getCoordinatorSelectOptions = () => {
    return COORDINATOR_DEFINITIONS.map((coordinator) => ({
        value: coordinator.id,
        label: coordinator.label,
        description: coordinator.description,
    }));
};

export const getCoordinatorConfig = (coordinatorId: string) => {
    return COORDINATOR_DEFINITIONS.find((c) => c.id === coordinatorId) || null;
};

export const hasCoordinator = (coordinatorId: string): boolean => {
    return COORDINATOR_DEFINITIONS.some((c) => c.id === coordinatorId);
};

/**
 * Get the processor for a specific coordinator
 */
export const getProcessor = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    const processorId = coordinator.processor;
    if (!hasProcessor(processorId)) return null;

    return getProcessorEntry(processorId);
};

/**
 * Get the processor config for a specific coordinator
 */
export const getProcessorConfig = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    const configId = coordinator.config;
    if (configId === null || !hasConfig(configId)) return null;

    return getConfigEntry(configId);
};

/**
 * Get the default view component for a specific coordinator
 */
export const getViewComponent = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    const defaultViewId = coordinator.defaultView;
    return getViewComponentFromRegistry(defaultViewId);
};

/**
 * Get a specific view component for a coordinator by view ID
 */
export const getSpecificViewComponent = (coordinatorId: string, viewId: ViewId) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    // Check if the requested view is available for this coordinator
    if (!coordinator.availableViews.includes(viewId)) return null;

    return getViewComponentFromRegistry(viewId);
};

/**
 * Get the view configuration for a specific coordinator
 */
export const getViewConfig = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    return {
        defaultView: coordinator.defaultView,
        availableViews: coordinator.availableViews,
    };
};

/**
 * Get all available views for a specific coordinator
 */
export const getAvailableViews = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return [];

    return coordinator.availableViews;
};

/**
 * Get the default view ID for a specific coordinator
 */
export const getDefaultViewId = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    return coordinator.defaultView;
};

/**
 * Get sample data IDs for a specific coordinator
 */
export const getSampleDataIds = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return [];

    return coordinator.sampleData;
};

/**
 * Get all necessary components and configs for a specific coordinator
 */
export const getCoordinatorBundle = (coordinatorId: string) => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    if (!coordinator) return null;

    return {
        coordinator,
        processor: getProcessor(coordinatorId),
        processorConfig: getProcessorConfig(coordinatorId),
        defaultViewComponent: getViewComponent(coordinatorId),
        viewConfig: getViewConfig(coordinatorId),
        sampleDataIds: getSampleDataIds(coordinatorId),
    };
};
