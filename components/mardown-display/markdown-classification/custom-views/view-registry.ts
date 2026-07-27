import dynamic from "next/dynamic";
import { getCoordinatorConfig } from "../markdown-coordinator";

// Views are code-split with next/dynamic({ ssr: false }) — never React.lazy
// (code-splitting doctrine rule 3): lazy SSRs by default, which compiled every
// view graph into the server pass of the applet-runner routes that reach this
// registry via DirectMarkdownRenderer. Consumers render these without their
// own Suspense, so `loading: () => null` preserves the render-nothing-while-
// loading behavior they already had.

export type ViewId =
    | "candidateProfile"
    | "candidateProfileCollapsible"
    | "modernCandidateProfile"
    | "modernOneColumnCandidateProfile"
    | "appSuggestions"
    | "dynamic"
    | "keyPoints"
    | "introOutroList"
    | "keyPointsNestedList"
    | "travelGuide"
    | "astRenderer"
    | "modernAstRenderer"
    | "modernKeywordAnalyzer"
    | "keywordHierarchy";

export const viewComponents = {
    candidateProfileView: dynamic(() => import("./view-components/CandidateProfileView"), { ssr: false, loading: () => null }),
    candidateProfileCollapsibleView: dynamic(() => import("./view-components/CandidateProfileWithCollapseView"), { ssr: false, loading: () => null }),
    modernCandidateProfileView: dynamic(() => import("./view-components/ModernCandidateProfileView"), { ssr: false, loading: () => null }),
    modernOneColumnCandidateProfileView: dynamic(() => import("./view-components/ModernOneColumnProfile"), { ssr: false, loading: () => null }),
    appSuggestionsView: dynamic(() => import("./view-components/AppSuggestionsView"), { ssr: false, loading: () => null }),
    dynamicView: dynamic(() => import("./view-components/DynamicView"), { ssr: false, loading: () => null }),
    keyPointsView: dynamic(() => import("./view-components/KeyPointsView"), { ssr: false, loading: () => null }),
    introOutroListView: dynamic(() => import("./view-components/IntroOutroListView"), { ssr: false, loading: () => null }),
    keyPointsNestedListView: dynamic(() => import("./view-components/KeyPointsNestedListView"), { ssr: false, loading: () => null }),
    travelGuideView: dynamic(() => import("./view-components/TravelGuideView"), { ssr: false, loading: () => null }),
    astRendererView: dynamic(() => import("./view-components/AstRendererView"), { ssr: false, loading: () => null }),
    modernAstRendererView: dynamic(() => import("./view-components/ModernAstRenderer"), { ssr: false, loading: () => null }),
    modernKeywordAnalyzerView: dynamic(() => import("./view-components/ModernKeywordAnalyzerView"), { ssr: false, loading: () => null }),
    keywordHierarchyView: dynamic(() => import("./view-components/LsiKeywordView"), { ssr: false, loading: () => null }),
};

export interface ViewExtractor {
    brokerId: string;
    path: string;
    type: string;
}

// Each view component declares its own concrete `data` shape (AstNode,
// CandidateProfileData, OutputContent, ...) — the registry is intentionally
// heterogeneous, so `React.ComponentType<any>` here is the correct escape
// valve for "any one of these incompatible component prop shapes", not a
// data-boundary hatch. Callers (ViewRenderer/ViewWrapper) pass `unknown` data
// through; each concrete component validates/narrows internally.
export interface ViewDefinition {
    id: ViewId;
    label: string;
    description: string;
    component: React.ComponentType<any>;
    extractors: ViewExtractor[];
}

const CANDIDATE_PROFILE_VIEW_DEFINITION: ViewDefinition = {
    id: "candidateProfile",
    label: "Candidate Profile View",
    description: "Standard candidate profile view with sections for experience and details",
    component: viewComponents.candidateProfileView,
    extractors: [],
};

const CANDIDATE_PROFILE_COLLAPSIBLE_VIEW_DEFINITION: ViewDefinition = {
    id: "candidateProfileCollapsible",
    label: "Collapsible Candidate Profile",
    description: "Candidate profile with collapsible sections for a more compact view",
    component: viewComponents.candidateProfileCollapsibleView,
    extractors: [],
};

const MODERN_CANDIDATE_PROFILE_VIEW_DEFINITION: ViewDefinition = {
    id: "modernCandidateProfile",
    label: "Modern Candidate Profile",
    description: "Modern candidate profile with gradient header and expandable sections",
    component: viewComponents.modernCandidateProfileView,
    extractors: [],
};

const MODERN_ONE_COLUMN_CANDIDATE_PROFILE_VIEW_DEFINITION: ViewDefinition = {
    id: "modernOneColumnCandidateProfile",
    label: "Modern One Column Profile",
    description: "Single column version of the modern candidate profile",
    component: viewComponents.modernOneColumnCandidateProfileView,
    extractors: [],
};

const APP_SUGGESTIONS_VIEW_DEFINITION: ViewDefinition = {
    id: "appSuggestions",
    label: "App Suggestions",
    description: "Display of app suggestions",
    component: viewComponents.appSuggestionsView,
    extractors: [
        {
            brokerId: "app-suggestion-entry",
            path: 'data["extracted"]["suggestions"]',
            type: "list",
        },
        {
            brokerId: "image-descriptions",
            path: 'data["extracted"]["suggestions"][?]["image_description"]',
            type: "text",
        },
    ],
};

const KEY_POINTS_VIEW_DEFINITION: ViewDefinition = {
    id: "keyPoints",
    label: "Key Points",
    description: "Key points view",
    component: viewComponents.keyPointsView,
    extractors: [],
};

const INTRO_OUTRO_LIST_VIEW_DEFINITION: ViewDefinition = {
    id: "introOutroList",
    label: "Intro Outro List",
    description: "Intro outro list view",
    component: viewComponents.introOutroListView,
    extractors: [],
};

const KEY_POINTS_NESTED_LIST_VIEW_DEFINITION: ViewDefinition = {
    id: "keyPointsNestedList",
    label: "Key Points Nested List",
    description: "Key points nested list view",
    component: viewComponents.keyPointsNestedListView,
    extractors: [],
};

const TRAVEL_GUIDE_VIEW_DEFINITION: ViewDefinition = {
    id: "travelGuide",
    label: "Travel Guide",
    description: "Interactive travel guide with sections for itinerary, tips, and recommendations",
    component: viewComponents.travelGuideView,
    extractors: [],
};

const DYNAMIC_VIEW_DEFINITION: ViewDefinition = {
    id: "dynamic",
    label: "Dynamic View",
    description: "Universal view that adapts to any data structure",
    component: viewComponents.dynamicView,
    extractors: [],
};

const AST_RENDERER_VIEW_DEFINITION: ViewDefinition = {
    id: "astRenderer",
    label: "Ast Renderer",
    description: "Ast Renderer",
    component: viewComponents.astRendererView,
    extractors: [],
};


const MODERN_AST_RENDERER_VIEW_DEFINITION: ViewDefinition = {
    id: "modernAstRenderer",
    label: "Modern Ast Renderer",
    description: "Modern Ast Renderer",
    component: viewComponents.modernAstRendererView,
    extractors: [],
};

const MODERN_KEYWORD_ANALYZER_VIEW_DEFINITION: ViewDefinition = {
    id: "modernKeywordAnalyzer",
    label: "Modern Keyword Analyzer",
    description: "Modern Keyword Analyzer",
    component: viewComponents.modernKeywordAnalyzerView,
    extractors: [],
};

const KEYWORD_HIERARCHY_VIEW_DEFINITION: ViewDefinition = {
    id: "keywordHierarchy",
    label: "Keyword Hierarchy",
    description: "Keyword Hierarchy",
    component: viewComponents.keywordHierarchyView,
    extractors: [],
};

export const VIEW_DEFINITIONS = {
    CANDIDATE_PROFILE_VIEW_DEFINITION,
    CANDIDATE_PROFILE_COLLAPSIBLE_VIEW_DEFINITION,
    MODERN_CANDIDATE_PROFILE_VIEW_DEFINITION,
    MODERN_ONE_COLUMN_CANDIDATE_PROFILE_VIEW_DEFINITION,
    APP_SUGGESTIONS_VIEW_DEFINITION,
    DYNAMIC_VIEW_DEFINITION,
    KEY_POINTS_VIEW_DEFINITION,
    INTRO_OUTRO_LIST_VIEW_DEFINITION,
    KEY_POINTS_NESTED_LIST_VIEW_DEFINITION,
    TRAVEL_GUIDE_VIEW_DEFINITION,
    AST_RENDERER_VIEW_DEFINITION,
    MODERN_AST_RENDERER_VIEW_DEFINITION,
    MODERN_KEYWORD_ANALYZER_VIEW_DEFINITION,
    KEYWORD_HIERARCHY_VIEW_DEFINITION,
};

export const getViewSelectOptions = () => {
    return Object.values(VIEW_DEFINITIONS).map((view) => ({
        value: view.id,
        label: view.label,
        description: view.description,
    }));
};

export const getViewComponent = (viewId: ViewId) => {
    const view = Object.values(VIEW_DEFINITIONS).find((v) => v.id === viewId);
    return view ? view.component : null;
};

export const hasExtractors = (viewId: ViewId) => {
    const view = Object.values(VIEW_DEFINITIONS).find((v) => v.id === viewId);
    return view ? view.extractors.length > 0 : false;
};

export const getDefaultViewId = (coordinatorId: string): ViewId => {
    const coordinator = getCoordinatorConfig(coordinatorId);
    return coordinator ? coordinator.defaultView : "dynamic";
};

export const getDefaultViewComponent = (coordinatorId: string) => {
    return getViewComponent(getDefaultViewId(coordinatorId));
};

