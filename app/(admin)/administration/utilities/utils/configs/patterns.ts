// Type definitions for patterns
export type PatternConfig = {
    pattern: RegExp;
    replacement: string | null;
};

export type MarkerPatternConfig = {
    start: string;
    end: string;
    replacement?: string | null;
};

export type ActionConfig = {
    remove?: string[];
    replace?: string[];
};

// Pattern configurations for removal and replacement
export const patterns: { [key: string]: PatternConfig } = {
    // Basic entity removals
    quotEntity: { pattern: /&quot;/g, replacement: null },
    gtEntity: { pattern: /&gt;/g, replacement: null },
    ampEntity: { pattern: /&amp;/g, replacement: null },
    htmlTag: { pattern: /<html>/g, replacement: null },

    // Replacements for common entities
    lineBreak: { pattern: /<br\/>/g, replacement: '\n' },
    ltEntity: { pattern: /&lt;/g, replacement: '<' },
    aposEntity: { pattern: /&apos;/g, replacement: '\'' },
    quotReplaceEntity: { pattern: /&quot;/g, replacement: '"' },

    // HTML-specific patterns to remove or replace attributes
    svgContent: { pattern: /<svg[\s\S]*?<\/svg>/gi, replacement: null },
    ariaAttribute: { pattern: /\saria-[\w-]+="[^"]*"/gi, replacement: ' aria-[removed]' },
    roleAttribute: { pattern: /\srole="[^"]*"/gi, replacement: ' role="[removed]"' },
    tabindex: { pattern: /\stabindex="[^"]*"/gi, replacement: ' tabindex="[removed]"' },
    pointerEvents: { pattern: /\spointer-events="[^"]*"/gi, replacement: ' pointer-events="[removed]"' },
    touchAction: { pattern: /\stouch-action="[^"]*"/gi, replacement: ' touch-action="[removed]"' },
    userSelect: { pattern: /\suser-select="[^"]*"/gi, replacement: ' user-select="[removed]"' },

    // Additional common patterns
    onClickAttribute: { pattern: /\sonclick="[^"]*"/gi, replacement: ' onclick="[removed]"' }, // Removes inline onclick JavaScript
    classAttribute: { pattern: /\sclass="[^"]*"/gi, replacement: ' class="[removed]"' }, // Removes class attributes
    styleAttribute: { pattern: /\sstyle="[^"]*"/gi, replacement: ' style="[removed]"' }, // Removes inline style attributes
    commentTags: { pattern: /<!--[\s\S]*?-->/g, replacement: null }, // Removes HTML comments
    metaTags: { pattern: /<meta[^>]*>/gi, replacement: null }, // Removes meta tags
    scriptTags: { pattern: /<script[\s\S]*?<\/script>/gi, replacement: null }, // Removes script tags
};

// Marker patterns for deletion, replacement, and extraction
export const markerPatternsToDelete: MarkerPatternConfig[] = [
    { start: '<start-marker>', end: '<end-marker>' },
    // Additional marker patterns can be added here
];

export const markerPatternsToReplace: MarkerPatternConfig[] = [
    { start: '<start-marker>', end: '<end-marker>', replacement: 'REPLACED_TEXT' },
    { start: '<svg', end: '</svg>', replacement: '<svg><!-- SVG removed --></svg>' },
    // Additional marker patterns for replacement can be added here
];

export const markerPatternsToExtract: MarkerPatternConfig[] = [
    { start: '<start-marker>', end: '<end-marker>' },
    // Additional marker patterns for extraction can be added here
];

/**
 * Cleans HTML based on specified actions in the config.
 * @param {string} content - The content string to clean.
 * @param {ActionConfig} config - Configuration specifying `remove` and `replace` actions.
 * @returns {string} - The transformed content.
 */
export function cleanContent(content: string, config: ActionConfig): string {
    let transformedContent = content;

    // Apply removal patterns (remove elements by replacing them with an empty string)
    config.remove?.forEach((patternKey: string) => {
        const patternConfig = patterns[patternKey];
        if (patternConfig && patternConfig.replacement === null) {
            transformedContent = transformedContent.replace(patternConfig.pattern, '');
        }
    });

    // Apply replacement patterns (substitute matched patterns with specified replacement)
    config.replace?.forEach((patternKey: string) => {
        const patternConfig = patterns[patternKey];
        if (patternConfig && patternConfig.replacement !== null) {
            transformedContent = transformedContent.replace(patternConfig.pattern, patternConfig.replacement);
        }
    });

    return transformedContent;
}



// Are these necessary?
export const initialPatternsToRemove = [
    '&quot;',
    '&gt;',
    '&amp;',
    '<html>',
];

export const initialPatternsToReplace = [
    {pattern: '<br/>', replacement: '\n'},
    {pattern: '&lt;', replacement: '<'},
    {pattern: '&gt;', replacement: '>'},
    {pattern: '&apos;', replacement: '\''},
    {pattern: '&quot;', replacement: '"'},
];

// Marker patterns for deletion and replacement
export const initialMarkerPatternsToDelete = [
    { start: '<start-marker>', end: '<end-marker>' },
];

export const initialMarkerPatternsToReplace = [
    { start: '<start-marker>', end: '<end-marker>', replacement: 'REPLACED_TEXT' },
];

// New marker patterns for extracting text
export const initialMarkerPatternsToExtract = [
    { start: '<start-marker>', end: '<end-marker>' },
];


export const htmlSpecificPatternsToRemove = [
    '<svg[\\s\\S]*?<\\/svg>',
];

export const htmlSpecificPatternsToReplace = [
    { pattern: '\\saria-[\\w-]+="[^"]*"', replacement: ' aria-[removed]' },
    { pattern: '\\srole="[^"]*"', replacement: ' role="[removed]"' },
    { pattern: '\\stabindex="[^"]*"', replacement: ' tabindex="[removed]"' },
    { pattern: '\\spointer-events="[^"]*"', replacement: ' pointer-events="[removed]"' },
    { pattern: '\\stouch-action="[^"]*"', replacement: ' touch-action="[removed]"' },
    { pattern: '\\suser-select="[^"]*"', replacement: ' user-select="[removed]"' },
];

export const htmlSpecificMarkerPatternsToReplace = [
    { start: '<svg', end: '</svg>', replacement: '<svg><!-- SVG removed --></svg>' },
];
