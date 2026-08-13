/**
 * Special Variables for Code Editor
 * 
 * These variables are automatically populated and managed by the system.
 * If a prompt defines any of these variables, they will be auto-filled
 * and hidden from the UI.
 */

export interface CodeEditorContext {
  /** The full current file content */
  currentCode: string;
  /** Currently selected/highlighted text (when available) */
  selection?: string;
  /** Additional context from other files (when available) */
  context?: string;
  /** Programming language of the code */
  language?: string;
}

/**
 * Special variable names that are auto-managed
 */
export const SPECIAL_VARIABLE_NAMES = {
  CURRENT_CODE: 'current_code',
  CONTENT: 'content',          // Alias for current_code
  SELECTION: 'selection',       // Highlighted text
  CONTEXT: 'context',          // Multi-file context
} as const;

/**
 * Check if a variable name is special (auto-managed)
 */
export function isSpecialVariable(variableName: string): boolean {
  return Object.values(SPECIAL_VARIABLE_NAMES).some(
    (name) => name === variableName,
  );
}

/**
 * Detect if code is already wrapped in a markdown code block
 */
function isWrappedInCodeBlock(code: string): boolean {
  const trimmed = code.trim();
  // Check if it starts with ``` and ends with ```
  return trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.split('```').length >= 3;
}

/**
 * Wrap code in a markdown code block with the appropriate language
 * If code is already wrapped, returns it as-is
 */
function wrapInCodeBlock(code: string, language?: string): string {
  // If already wrapped, return as-is
  if (isWrappedInCodeBlock(code)) {
    return code;
  }
  
  // Use the provided language or default to a generic marker
  const lang = language || 'code';
  
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Build special variables object based on what's needed
 * Only includes variables that are actually defined in the prompt
 * Automatically wraps code in markdown code blocks for the AI model
 */
export function buildSpecialVariables(
  codeContext: CodeEditorContext,
  requiredVariables: string[],
  language?: string
): Record<string, string> {
  const specialVars: Record<string, string> = {};
  
  // current_code - the full current file
  if (requiredVariables.includes(SPECIAL_VARIABLE_NAMES.CURRENT_CODE)) {
    specialVars[SPECIAL_VARIABLE_NAMES.CURRENT_CODE] = wrapInCodeBlock(
      codeContext.currentCode,
      language || codeContext.language
    );
  }
  
  // content - alias for current_code (for consistency with different prompt styles)
  if (requiredVariables.includes(SPECIAL_VARIABLE_NAMES.CONTENT)) {
    specialVars[SPECIAL_VARIABLE_NAMES.CONTENT] = wrapInCodeBlock(
      codeContext.currentCode,
      language || codeContext.language
    );
  }
  
  // selection - highlighted text (if available)
  if (requiredVariables.includes(SPECIAL_VARIABLE_NAMES.SELECTION)) {
    const selectionCode = codeContext.selection || codeContext.currentCode;
    specialVars[SPECIAL_VARIABLE_NAMES.SELECTION] = wrapInCodeBlock(
      selectionCode,
      language || codeContext.language
    );
  }
  
  // context - multi-file context (if available, otherwise falls back to current code)
  if (requiredVariables.includes(SPECIAL_VARIABLE_NAMES.CONTEXT)) {
    const contextCode = codeContext.context || codeContext.currentCode;
    specialVars[SPECIAL_VARIABLE_NAMES.CONTEXT] = wrapInCodeBlock(
      contextCode,
      language || codeContext.language
    );
  }
  
  return specialVars;
}

/**
 * Filter out special variables from a list of variables
 * Used to hide auto-managed variables from the UI
 */
export function filterOutSpecialVariables<T extends { name: string }>(
  variables: T[]
): T[] {
  return variables.filter(v => !isSpecialVariable(v.name));
}

/**
 * Get list of special variable names that exist in a prompt's variables
 */
export function getRequiredSpecialVariables(
  promptVariables: { name: string }[]
): string[] {
  return promptVariables
    .map(v => v.name)
    .filter(name => isSpecialVariable(name));
}

/**
 * Helper to log which special variables are being used
 */
export function logSpecialVariablesUsage(
  promptName: string,
  specialVars: Record<string, string>
): void {
  const varNames = Object.keys(specialVars);
  if (varNames.length > 0) {
    console.log(`🔧 [${promptName}] Auto-populating special variables:`, varNames.join(', '));
    
    // Log lengths for debugging
    varNames.forEach(name => {
      const length = specialVars[name]?.length || 0;
      console.log(`   - ${name}: ${length} characters`);
    });
  }
}
