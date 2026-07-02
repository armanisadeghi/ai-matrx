/**
 * Represents a path expression for extracting data from objects
 */
type PathExpression = string;

/**
 * Result of a path extraction operation
 */
type ExtractionResult = unknown;

/**
 * Options for extraction behavior
 */
interface ExtractionOptions {
  /**
   * When true, returns null for missing paths instead of undefined
   */
  nullForMissing?: boolean;
  
  /**
   * When true, preserves array structure for wildcards instead of flattening
   */
  preserveArrays?: boolean;
  
  /**
   * Alternative wildcard character (defaults to '*')
   */
  wildcardChar?: string;
}

/**
 * Extracts values from an object using a path expression
 * @param obj - The source object
 * @param path - A dot-notation path that can include wildcards
 * @param options - Configuration options for extraction behavior
 * @returns The extracted value(s) or undefined if not found
 */
function extractValueByPath(
  obj: unknown,
  path: PathExpression,
  options: ExtractionOptions = {}
): ExtractionResult {
  if (!obj || !path) {
    return options.nullForMissing ? null : undefined;
  }

  const wildcardChar = options.wildcardChar || '*';

  // Handle 'data.' prefix - strip it since our obj is already the root data
  const normalizedPath = path.startsWith('data.') ? path.substring(5) : path;
  const keys = normalizedPath.split('.');


  // Helper function to handle recursive path extraction
  function extract(current: unknown, keyIndex: number): ExtractionResult {
    // Base case: we've processed all keys
    if (keyIndex >= keys.length) return current;

    // Null/undefined check
    if (current === null || current === undefined) {
      return options.nullForMissing ? null : undefined;
    }

    const key = keys[keyIndex];

    // Handle wildcard for arrays and objects
    if (key === wildcardChar) {
      // For arrays: map each element through the remaining path
      if (Array.isArray(current)) {
        return current.map(item => extract(item, keyIndex + 1));
      }
      // For objects: map each value through the remaining path
      else if (typeof current === 'object' && current !== null) {
        return Object.values(current).map(value => extract(value, keyIndex + 1));
      }
      return options.nullForMissing ? null : undefined;
    }

    // Handle numeric indices for arrays
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      const index = parseInt(key, 10);
      if (index >= current.length) {
        return options.nullForMissing ? null : undefined;
      }
    }

    // Regular property access
    if (typeof current !== 'object' || current === null) {
      return options.nullForMissing ? null : undefined;
    }

    return extract((current as Record<string, unknown>)[key], keyIndex + 1);
  }

  // Handle results with nested arrays from wildcards
  function processResult(result: ExtractionResult): ExtractionResult {

    if (!Array.isArray(result) || options.preserveArrays) return result;

    // Check if result contains arrays that need flattening
    const needsFlattening = result.some(item => Array.isArray(item));
    if (needsFlattening) {
      const flattenedResult = result
        .flat(Infinity)
        .filter(item => item !== undefined && item !== null);
      return flattenedResult;
    }
    return result;
  }

  const result = extract(obj, 0);
  const processedResult = processResult(result);
  return processedResult;
}

/**
 * Creates a reusable extractor function from a path
 * @param path - The path expression to compile
 * @param options - Configuration options for the extractor
 * @returns A function that extracts values from objects
 */
function createExtractor(
  path: PathExpression,
  options: ExtractionOptions = {}
): (obj: unknown) => ExtractionResult {
  return (obj: unknown) => extractValueByPath(obj, path, options);
}

/**
 * Creates an extractor and immediately applies it to an object
 * @param obj - The source object
 * @param path - The path expression
 * @param options - Configuration options
 * @returns The extraction result
 */
function extract(
  obj: unknown,
  path: PathExpression,
  options: ExtractionOptions = {}
): ExtractionResult {
  return extractValueByPath(obj, path, options);
}

// Export an API object for consistent usage
const ObjectPathExtractor = {
  extractValueByPath,
  createExtractor,
  extract
};

export default ObjectPathExtractor;
export { extractValueByPath, createExtractor, extract };