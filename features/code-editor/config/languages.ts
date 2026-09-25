/**
 * Central Language Utilities
 * Single source of truth for all language mappings and conversions
 */

// Normalize language for better syntax highlighting
export function normalizeLanguage(lang: string): string {
    const langLower = lang.toLowerCase();

    // Map common variations to standard language identifiers
    const languageMap: Record<string, string> = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'jsx',
        'tsx': 'tsx',
        'react': 'typescript',
        'typescript': 'typescript',
        'javascript': 'javascript',
        'py': 'python',
        'python': 'python',
        'rb': 'ruby',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'csharp': 'csharp',
        'php': 'php',
        'swift': 'swift',
        'kotlin': 'kotlin',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sql': 'sql',
        'bash': 'bash',
        'sh': 'bash',
        'shell': 'bash',
        'markdown': 'markdown',
        'md': 'markdown',
    };

    return languageMap[langLower] || lang;
}

/**
 * Map language identifiers to Monaco Editor-compatible language names
 * @param lang - The language identifier (may be undefined, null, or invalid)
 * @returns A valid Monaco language name, defaulting to 'plaintext' if invalid
 */
export function mapLanguageForMonaco(lang: string): string {
    // Defensive: Handle undefined, null, empty, or non-string values
    if (!lang || typeof lang !== 'string') {
        return 'plaintext';
    }

    const languageMap: Record<string, string> = {
        'react': 'typescript',  // React components → TypeScript (Monaco uses 'typescript' for TSX)
        'jsx': 'javascript',    // JavaScript JSX → Monaco uses 'javascript' for JSX
        'tsx': 'typescript',    // TypeScript JSX → Monaco uses 'typescript' for TSX
        'typescript': 'typescript',
        'javascript': 'javascript',
        'js': 'javascript',
        'ts': 'typescript',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'markdown': 'markdown',
        'md': 'markdown',
        'bash': 'shell',
        'shell': 'shell',
        'sh': 'shell',
        'sql': 'sql',
        'python': 'python',
        'py': 'python',
        'diff': 'diff',
        'java': 'java',
        'csharp': 'csharp',
        'cs': 'csharp',
        'php': 'php',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'text': 'plaintext',
        'plaintext': 'plaintext',
    };
    
    const normalizedLang = lang.trim().toLowerCase();
    return languageMap[normalizedLang] || normalizedLang || 'plaintext';
}

/**
 * Normalize a fence language to the canonical view-language name
 * (`js` → `javascript`, `sh` → `bash`, …) — used for language checks such as
 * "is this a complete HTML document". Highlighting itself is Shiki's
 * (code-block/highlight/shiki-highlighter.ts), which resolves its own grammars.
 * @param lang - The language identifier (may be undefined, null, or invalid)
 * @returns The canonical language name, defaulting to 'text' if invalid
 */
export function normalizeViewLanguage(lang: string): string {
    // Defensive: Handle undefined, null, empty, or non-string values
    if (!lang || typeof lang !== 'string') {
        return 'text';
    }

    const languageMap: Record<string, string> = {
        'react': 'tsx',          // React components → TypeScript JSX
        'jsx': 'jsx',            // JavaScript JSX
        'tsx': 'tsx',            // TypeScript JSX
        'typescript': 'typescript',
        'javascript': 'javascript',
        'js': 'javascript',
        'ts': 'typescript',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'markdown': 'markdown',
        'md': 'markdown',
        'bash': 'bash',
        'shell': 'bash',
        'sql': 'sql',
        'python': 'python',
        'py': 'python',
        'diff': 'diff',
        'text': 'text',
        'plaintext': 'text',
    };
    
    const normalizedLang = lang.trim().toLowerCase();
    return languageMap[normalizedLang] || normalizedLang || 'text';
}

/**
 * Get file extension for Monaco Editor JSX/TSX support
 * Used when creating Monaco models to enable proper syntax highlighting
 * @param lang - The language identifier
 * @returns File extension (e.g., '.tsx', '.jsx') or undefined for other languages
 */
export function getMonacoFileExtension(lang: string): string | undefined {
    if (!lang || typeof lang !== 'string') {
        return undefined;
    }
    
    const normalized = lang.trim().toLowerCase();
    if (normalized === 'tsx' || normalized === 'react') return '.tsx';
    if (normalized === 'jsx') return '.jsx';
    return undefined;
}

/**
 * Get comprehensive file extension for any language
 * Used for file downloads and general file identification
 * @param lang - The language identifier
 * @returns File extension string (e.g., '.ts', '.py', '.txt')
 */
export function getFileExtension(lang: string): string {
    // Use explicit fileExtension if provided
    if (!lang || typeof lang !== 'string') {
        return '.txt';
    }

    const extensionMap: Record<string, string> = {
        'typescript': '.ts',
        'javascript': '.js',
        'jsx': '.jsx',
        'tsx': '.tsx',
        'react': '.tsx',
        'json': '.json',
        'html': '.html',
        'css': '.css',
        'scss': '.scss',
        'python': '.py',
        'py': '.py',
        'java': '.java',
        'cpp': '.cpp',
        'c': '.c',
        'csharp': '.cs',
        'cs': '.cs',
        'php': '.php',
        'ruby': '.rb',
        'rb': '.rb',
        'go': '.go',
        'rust': '.rs',
        'swift': '.swift',
        'kotlin': '.kt',
        'sql': '.sql',
        'shell': '.sh',
        'sh': '.sh',
        'bash': '.sh',
        'yaml': '.yaml',
        'yml': '.yaml',
        'xml': '.xml',
        'markdown': '.md',
        'md': '.md',
        'text': '.txt',
        'plaintext': '.txt',
    };
    
    const normalizedLang = lang.trim().toLowerCase();
    return extensionMap[normalizedLang] || '.txt';
}