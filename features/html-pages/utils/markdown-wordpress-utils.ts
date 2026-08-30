/**
 * JSON clipboard formatting.
 *
 * The markdown→WordPress-HTML converter that used to live here now ships in
 * `@ai-matrx/print/markdown` as `markdownToHtml` — it was the package's
 * required-injection port and is now its shipped default (0.3.0). Do not
 * re-add a local converter: fix it in the package.
 */

/**
 * Formats JSON data for clipboard
 * @param data - The JSON data to format (arbitrary, possibly nested/stringified JSON)
 * @returns {string} - Formatted JSON string
 */
export function formatJsonForClipboard(data: unknown): string {
    const cleanObject = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }

      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === 'string') {
          try {
            // Try to parse stringified JSON and recurse
            const parsed: unknown = JSON.parse(value);
            cleaned[key] = cleanObject(parsed);
          } catch {
            // If it's not valid JSON, keep it as a string
            cleaned[key] = value;
          }
        } else {
          cleaned[key] = cleanObject(value);
        }
      }
      return cleaned;
    };

    // Clean the data first, then stringify without extra escapes
    const cleanedData = cleanObject(data);
    return JSON.stringify(cleanedData, null, 2);
}
