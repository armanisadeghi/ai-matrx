import { getConfigObject } from "./json-config-system/config-registry";
import { AstNode } from "./types";
import { parseMarkdownToAst } from "../markdown-processor-util";

// Lazy-loaded processor functions
const getIntroOutroListProcessor = () => import("./custom/intro-outro-list").then(mod => mod.default);
const getProcessMarkdownWithConfig = () => import("./json-config-system/config-processor").then(mod => mod.default);
const getIntroOutroNestedListProcessor = () => import("./custom/intro-outro-nested-list").then(mod => mod.default);
const getHeadingListProcessor = () => import("./custom/heading-list-processor").then(mod => mod.default);
const getSectionedListProcessor = () => import("./custom/sectioned-list-processor").then(mod => mod.default);
const getCombinedProcessor = () => import("./custom/combined-processor").then(mod => mod.default);
const getCombinedProcessorWithConfig = () => import("./combined-processor-config-system/break-config-processor").then(mod => mod.default);
const getStructuredASTWithConfig = () => import("./structured-ast-config-system/structured-ast-processor").then(mod => mod.default);
const getParserSeparated = () => import("./custom/parser-separated").then(mod => mod.default);
const getParserEnhanced = () => import("./custom/enhanced-parser").then(mod => mod.default);
const getParseMarkdownSimple = () => import("./custom/simple-markdown-parser").then(mod => mod.default);

// Individual processor definitions
const INTRO_OUTRO_LIST_DEFINITION = {
    id: "intro-outro-list",
    label: "Intro Outro List",
    description:
        "Designed to process something very simple with just an intro, a list of items with bold labels/text and then an outro, with an optional bold start and text.",
    processor: getIntroOutroListProcessor,
    input: "ast",
    output: "introOutroList",
    config: "noConfig",
};

const AST_TO_JSON_WITH_CONFIG_DEFINITION = {
    id: "ast-to-json-with-config",
    label: "Markdown to JSON with Config",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getProcessMarkdownWithConfig,
    input: "ast",
    output: "markdownProcessorResult",
    config: "jsonConfigSystemRegistry",
};

const COMBINED_PROCESSOR_WITH_CONFIG_DEFINITION = {
    id: "combined-processor-with-config",
    label: "Combined Processor with Config",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getCombinedProcessorWithConfig,
    input: "ast",
    output: "combinedProcessorWithConfig",
    config: "combinedProcessorConfigRegistry",
};


const STRUCTURED_AST_WITH_CONFIG_DEFINITION = {
    id: "structured-ast-with-config",
    label: "Structured AST with Config",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getStructuredASTWithConfig,
    input: "ast",
    output: "structuredASTWithConfig",
    config: "structuredASTConfigRegistry",
};


const INTRO_OUTRO_NESTED_LIST_DEFINITION = {
    id: "intro-outro-nested-list",
    label: "Intro Outro Nested List",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getIntroOutroNestedListProcessor,
    input: "ast",
    output: "introOutroNestedList",
    config: "noConfig",
};


const SECTIONED_LIST_DEFINITION = {
    id: "sectioned-list",
    label: "Sectioned List",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getSectionedListProcessor,
    input: "ast",
    output: "sectionedList",
    config: "noConfig",
};

const HEADING_LIST_DEFINITION = {
    id: "heading-list",
    label: "Heading List",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getHeadingListProcessor,
    input: "ast",
    output: "headingList",
    config: "noConfig",
};

const COMBINED_PROCESSOR_DEFINITION = {
    id: "combined-processor",
    label: "Combined Processor",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getCombinedProcessor,
    input: "ast",
    output: "combinedProcessor",
    config: "noConfig",
};

const PARSER_ENHANCED_DEFINITION = {
    id: "parser-enhanced",
    label: "Parser Enhanced",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getParserEnhanced,
    input: "markdown",
    output: "parserEnhanced",
    config: "noConfig",
};

const PARSER_SEPARATED_DEFINITION = {
    id: "parser-separated",
    label: "Parser Separated",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getParserSeparated,
    input: "markdown",
    output: "parserSeparated",
    config: "noConfig",
};

const PARSER_SIMPLE_DEFINITION = {
    id: "parser-simple",
    label: "Parser Simple",
    description: "Designed to process a markdown file into a JSON object using a custom config.",
    processor: getParseMarkdownSimple,
    input: "markdown",
    output: "parserSimple",
    config: "noConfig",
};



// Processor registry as an array
export const PROCESSOR_REGISTRY = [
    INTRO_OUTRO_LIST_DEFINITION,
    AST_TO_JSON_WITH_CONFIG_DEFINITION,
    INTRO_OUTRO_NESTED_LIST_DEFINITION,
    HEADING_LIST_DEFINITION,
    SECTIONED_LIST_DEFINITION,
    COMBINED_PROCESSOR_DEFINITION,
    COMBINED_PROCESSOR_WITH_CONFIG_DEFINITION,
    STRUCTURED_AST_WITH_CONFIG_DEFINITION,
    PARSER_ENHANCED_DEFINITION,
    PARSER_SEPARATED_DEFINITION,
    PARSER_SIMPLE_DEFINITION,
];


// Map processor IDs to required config types
export const PROCESSOR_CONFIG_TYPE_MAP: Record<string, string> = {
    "ast-to-json-with-config": "jsonConfig",
    "combined-processor-with-config": "breakConfig",
    "structured-ast-with-config": "structuredAst"
};


// Utility functions
export const getProcessorSelectOptions = () => {
    return PROCESSOR_REGISTRY.map(processor => ({
        value: processor.id,
        label: processor.label,
        description: processor.description
    }));
};

export const getProcessorEntry = (processorId: string) => {
    return PROCESSOR_REGISTRY.find(p => p.id === processorId) || null;
};

export const hasProcessor = (processorId: string) => {
    return PROCESSOR_REGISTRY.some(p => p.id === processorId);
};

// Every lazy-loaded processor module takes a differently-shaped named-field
// input (`{ast}`, `{ast, config}`, `{markdown}`, ...) and returns a
// differently-shaped result — this registry dispatches to whichever one is
// requested by id, so the input/output are genuinely unknown at this layer;
// each caller of a specific processor knows (and asserts) its own shape.
type ProcessorDynamicInput = Record<string, unknown>;

export const getProcessorFunction = (processorId: string) => {
    const processorEntry = getProcessorEntry(processorId);
    if (!processorEntry) return null;

    // Return a function that handles the dynamic import and calling internally.
    // `processorEntry.processor()` resolves to whichever specific processor
    // module matched `processorId` — each has its own narrow parameter shape
    // (`{ast, config}`, `{ast}`, or a raw markdown string), so the resolved
    // value is a union of incompatible call signatures that TypeScript cannot
    // statically apply a single argument shape to. Dispatch through
    // `Function.prototype.apply` (an ordinary JS mechanism, not a type
    // assertion) since the caller-side `execute*` helpers below are what
    // guarantee each id is invoked with the input shape that specific
    // processor actually expects.
    return async (input: ProcessorDynamicInput) => {
        const processorModule = await processorEntry.processor();
        return Function.prototype.apply.call(processorModule, null, [input]);
    };
};

export const executeProcessor = async <T = unknown>(
    processorId: string,
    ast: AstNode,
    config: unknown
): Promise<T | null> => {
    const processorFunction = getProcessorFunction(processorId);
    if (!processorFunction) return null;

    return (await processorFunction({ ast, config })) as T;
};

export const executeProcessorWithConfigId = async <T = unknown>(
    processorId: string,
    ast: AstNode,
    configId: string
): Promise<T | null> => {
    const config = getConfigObject(configId);
    if (!config) return null;
    const processorFunction = getProcessorFunction(processorId);
    if (!processorFunction) return null;

    return (await processorFunction({ ast, config })) as T;
};

export const executeMarkdownParser = async (markdown: string, parserId: string) => {
    const processorFunction = getProcessorFunction(parserId);
    if (!processorFunction) return null;
    return processorFunction({ markdown });
};



// THIS IS NOT YET FULLY UTILIZED!!!! ----- THIS IS A GREAT TOOL --------


/**
 * Intelligent processor function that handles any combination of inputs
 * and automatically determines what to pass to the processor based on its definition
 */
export const executeIntelligentProcessor = async <T = unknown>(
    processorId: string,
    options: {
        ast?: AstNode;
        markdown?: string;
        config?: unknown;
        configId?: string;
    }
): Promise<T | null> => {
    const { ast, markdown, config, configId } = options;
    
    // Get processor definition
    const processorEntry = getProcessorEntry(processorId);
    if (!processorEntry) {
        console.warn(`Processor with ID "${processorId}" not found`);
        return {} as T;
    }
    
    const processorFunction = getProcessorFunction(processorId);
    if (!processorFunction) {
        console.warn(`Processor function for ID "${processorId}" could not be loaded`);
        return {} as T;
    }
    
    // Determine what the processor needs
    const needsAst = processorEntry.input === "ast";
    const needsMarkdown = processorEntry.input === "markdown";
    const needsConfig = processorEntry.config !== "noConfig";
    
    // Prepare the input object
    const processorInput: ProcessorDynamicInput = {};

    // Handle AST requirement
    if (needsAst) {
        if (ast) {
            // We have AST, use it directly
            processorInput.ast = ast;
        } else if (markdown) {
            // We need AST but only have markdown, convert it
            console.log(`Converting markdown to AST for processor "${processorId}"`);
            try {
                processorInput.ast = await parseMarkdownToAst(markdown);
            } catch (error) {
                console.warn(`Failed to convert markdown to AST for processor "${processorId}":`, error);
                return {} as T;
            }
        } else {
            console.warn(`Processor "${processorId}" requires AST input but neither AST nor markdown was provided`);
            return {} as T;
        }
    }
    
    // Handle markdown requirement
    if (needsMarkdown) {
        if (markdown) {
            // We have markdown, use it directly
            processorInput.markdown = markdown;
        } else {
            console.warn(`Processor "${processorId}" requires markdown input but markdown was not provided`);
            return {} as T;
        }
    }
    
    // Handle config requirement
    if (needsConfig) {
        let resolvedConfig = config;
        
        // If configId is provided, try to get config from registry
        if (configId && !resolvedConfig) {
            resolvedConfig = getConfigObject(configId);
            if (!resolvedConfig) {
                console.warn(`Config with ID "${configId}" not found for processor "${processorId}"`);
                return {} as T;
            }
        }
        
        if (resolvedConfig) {
            processorInput.config = resolvedConfig;
        } else {
            console.warn(`Processor "${processorId}" requires config but none was provided`);
            return {} as T;
        }
    } else {
        // Processor doesn't need config, but we might still need to pass an empty one
        // for processors that expect it in their signature but ignore it
        if (needsAst) {
            processorInput.config = {};
        }
    }
    
    // Log what we're about to do
    const inputKeys = Object.keys(processorInput);
    console.log(`Executing processor "${processorId}" with inputs: [${inputKeys.join(', ')}]`);
    
    try {
        const result = await processorFunction(processorInput);
        return result as T;
    } catch (error) {
        console.warn(`Error executing processor "${processorId}":`, error);
        return {} as T;
    }
};