/**
 * Configuration Instructions for AI App Generation
 *
 * This file contains human-readable descriptions of each configuration option
 * that will be used to instruct the AI model when generating custom prompt apps.
 */

export type FormatType =
  | "chat"
  | "form"
  | "widget"
  | "form-to-chat"
  | "centered-input"
  | "chat-with-history";
export type DisplayMode = "matrx-format" | "custom";
export type ResponseMode = "stream" | "loader";

/**
 * App Format Descriptions (page_layout_format)
 */
export const formatInstructions: Record<FormatType, string> = {
  chat: "Chat layout with input at bottom, messages flowing up like ChatGPT",

  form: "Form layout with inputs at top, results displayed below",

  widget: "Compact widget layout, all in one contained space",

  "form-to-chat":
    "Form layout for initial input, then transitions to a chat interface after the first response. The form collapses and a chat input appears at the bottom for follow-up conversation.",

  "centered-input":
    "Large centered input like a landing page. After the first message, converts to a full chat interface with messages flowing up and input pinned at bottom.",

  "chat-with-history":
    "Full chat interface with a collapsible sidebar on the left showing past conversation runs. Sidebar only visible for authenticated users.",
};

/**
 * Display Component Descriptions (response_display_component)
 */
export const displayModeInstructions: Record<DisplayMode, string> = {
  "matrx-format":
    "Use the canonical MarkdownStream for the complete response. Accept response, requestId, conversationId, and isStreaming from the host and render <MarkdownStream content={response} requestId={requestId} conversationId={conversationId} isStreamActive={isStreaming} />. Keep it mounted while streaming.",

  custom:
    "Build custom input and surrounding app chrome, but render the complete model response through canonical MarkdownStream. Never parse, inspect, or re-render a registered __kind payload yourself; its one registered kind component owns the display everywhere.",
};

/**
 * Non-negotiable host/runtime contract appended to every generator request.
 * User customization may add to these rules but can never replace them.
 */
export const AGENT_APP_GENERATOR_CONTRACT = `
PLATFORM CONTRACT — follow every rule:
- The host owns the application shell and route header. Do not render PageHeader, RouteHeader, a fixed viewport header, navigation tabs, history controls, or full-screen height calculations inside the generated component.
- Render the live response through the canonical MarkdownStream. Accept response, requestId, conversationId, and isStreaming from props and pass all four through. Keep MarkdownStream mounted throughout the stream.
- Never use JSON.parse, regular expressions, code-fence extraction, response.match, or manual __kind checks on model output.
- Never hand-render any registered __kind shape, any subset of one, or a replacement card/table for one. The Shape registry's single canonical component renders it incrementally and after completion.
- Do not wrap MarkdownStream in prose/typography classes and do not hide it behind a "valid JSON" or "stream complete" condition. Custom cards may frame ordinary form inputs; structured output remains canonical.
- Use only the imports supplied by the allowlist and spell MarkdownStream exactly as @/components/MarkdownStream.
`.trim();

/**
 * Response Display Mode Descriptions (response_display_mode)
 */
export const responseModeInstructions: Record<ResponseMode, string> = {
  stream: "Show initial loader and then stream the response",

  loader:
    "Show full loading screen, then display complete response all at once",
};

/**
 * Builtin Variables Configuration
 *
 * These functions prepare the specific string values for each builtin variable
 * that will be passed to the prompt_builtin
 */

/**
 * Generate input_fields_to_include variable
 * Default: "Include all fields, including additional instructions"
 */
export function generateInputFieldsToInclude(config: {
  includeUserInstructions: boolean;
  includedVariables: Record<string, boolean>;
  variableDefaults: any[];
}): string {
  // Get included variables
  const includedVars = config.variableDefaults.filter(
    (v) => config.includedVariables[v.name] !== false,
  );

  // If no specific configuration, use default
  if (Object.keys(config.includedVariables).length === 0) {
    return "Include all fields, including additional instructions";
  }

  const fields: string[] = [];

  if (includedVars.length > 0) {
    includedVars.forEach((variable) => {
      let fieldDesc = `${variable.name}`;

      if (variable.defaultValue) {
        fieldDesc += ` (Default: "${variable.defaultValue}")`;
      }

      if (variable.customComponent?.options) {
        const componentType = variable.customComponent.type || "select";
        fieldDesc += ` - ${componentType} with options: ${variable.customComponent.options.join(", ")}`;
      }

      fields.push(fieldDesc);
    });
  }

  // Add user instructions field if enabled
  if (config.includeUserInstructions) {
    fields.push("additional_instructions");
  }

  return fields.length > 0
    ? fields.join(", ")
    : "Include all fields, including additional instructions";
}

/**
 * Generate page_layout_format variable
 * Default: "Choose the best option for my prompt and purpose"
 */
export function generatePageLayoutFormat(format: FormatType | null): string {
  if (!format) {
    return "Choose the best option for my prompt and purpose";
  }
  return formatInstructions[format];
}

/**
 * Generate response_display_component variable
 */
export function generateResponseDisplayComponent(
  displayMode: DisplayMode,
): string {
  return displayModeInstructions[displayMode];
}

/**
 * Generate response_display_mode variable
 */
export function generateResponseDisplayMode(
  responseMode: ResponseMode,
): string {
  return responseModeInstructions[responseMode];
}

/**
 * Generate color_pallet_options variable
 * Default: "Choose whatever colors will be best for my specific app and make sure they match the vibe of what I'm doing"
 */
export function generateColorPalletOptions(
  colorMode: "auto" | "custom",
  colors?: {
    primary: string;
    secondary: string;
    accent: string;
  },
): string {
  if (colorMode === "auto") {
    return "Choose whatever colors will be best for my specific app and make sure they match the vibe of what I'm doing";
  }

  if (!colors) {
    return "Choose whatever colors will be best for my specific app and make sure they match the vibe of what I'm doing";
  }

  return `Use these specific colors:\nPrimary: ${colors.primary}\nSecondary: ${colors.secondary}\nAccent: ${colors.accent}`;
}

/**
 * Main function to generate all builtin variables
 */
export function generateBuiltinVariables(config: {
  promptObject: any;
  format: FormatType;
  displayMode: DisplayMode;
  responseMode: ResponseMode;
  includeUserInstructions: boolean;
  includedVariables: Record<string, boolean>;
  variableDefaults: any[];
  colorMode: "auto" | "custom";
  colors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  customInstructions?: string;
}) {
  return {
    prompt_object: JSON.stringify(config.promptObject || {}),
    sample_response:
      "Sample response is not available but easy to determine, based on the prompt object.",
    input_fields_to_include: generateInputFieldsToInclude({
      includeUserInstructions: config.includeUserInstructions,
      includedVariables: config.includedVariables,
      variableDefaults: config.variableDefaults,
    }),
    page_layout_format: generatePageLayoutFormat(config.format),
    response_display_component: generateResponseDisplayComponent(
      config.displayMode,
    ),
    response_display_mode: generateResponseDisplayMode(config.responseMode),
    color_pallet_options: generateColorPalletOptions(
      config.colorMode,
      config.colors,
    ),
    custom_instructions: [
      AGENT_APP_GENERATOR_CONTRACT,
      config.customInstructions?.trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/**
 * Helper to get a short description for each option (useful for tooltips or summaries)
 */
export const shortDescriptions = {
  format: {
    chat: "Conversational interface with messages flowing vertically",
    form: "Traditional form layout with inputs at top, results below",
    widget: "Compact widget for embedding",
    "form-to-chat":
      "Form for initial input, then transitions to chat for follow-ups",
    "centered-input":
      "Landing-page input that converts to chat after first message",
    "chat-with-history":
      "Full chat with sidebar showing past conversation runs",
  },
  displayMode: {
    "matrx-format": "Rich formatted output with Matrx styling",
    custom: "Purpose-built UI for specific output structure",
  },
  responseMode: {
    stream: "Content appears as it's generated",
    loader: "Loading screen, then complete result",
  },
} as const;
