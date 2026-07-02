/**
 * Robust JSON Normalization Utility
 * 
 * This utility ensures consistent handling of JSON data by normalizing
 * strings, objects, and nested structures into standardized formats.
 */

/**
 * Recursively normalizes any data structure to a proper JavaScript object.
 * Handles nested JSON strings, circular references, and various data types.
 *
 * @param {unknown} data - The data to normalize (string, object, array, etc.)
 * @param {Set<unknown>} [visited=new Set()] - Set of visited objects (for circular reference detection)
 * @returns {unknown} - A properly normalized JavaScript object
 */
export const normalizeToObject = (data: unknown, visited: Set<unknown> = new Set()): unknown => {
    // Handle null or undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types (they don't need normalization)
    if (typeof data !== 'object' && typeof data !== 'string') {
      return data;
    }

    // Handle string that might be JSON
    if (typeof data === 'string') {
      try {
        // Try to parse it as JSON
        const parsed = JSON.parse(data);
        // If parsing succeeded, normalize the parsed result recursively
        return normalizeToObject(parsed, visited);
      } catch (e) {
        // If it's not valid JSON, return the original string
        return data;
      }
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => normalizeToObject(item, new Set(visited)));
    }

    // Handle Date objects (convert to ISO string)
    if (data instanceof Date) {
      return data.toISOString();
    }

    // At this point, we're dealing with a regular object

    // Check for circular references
    if (visited.has(data)) {
      return "[Circular Reference]";
    }

    // Add this object to the visited set
    visited.add(data);

    // Clone the object
    const result: Record<string, unknown> = {};
    const dataRecord = data as Record<string, unknown>;

    // Process each property
    for (const key in dataRecord) {
      if (Object.prototype.hasOwnProperty.call(dataRecord, key)) {
        const value = dataRecord[key];

        // Special handling for properties that might be JSON strings
        if (typeof value === 'string') {
          try {
            // Try to parse the string value as JSON
            const parsedValue = JSON.parse(value);
            // If parsing succeeded, normalize the parsed result recursively
            result[key] = normalizeToObject(parsedValue, new Set(visited));
          } catch (e) {
            // If it's not valid JSON, keep the original string
            result[key] = value;
          }
        } else {
          // For non-string properties, normalize recursively
          result[key] = normalizeToObject(value, new Set(visited));
        }
      }
    }

    return result;
  };
  
  /**
   * Normalizes data and ensures all nested objects are converted to JSON strings
   * where they should be strings. This is useful for preparing an object to be
   * transmitted through an API or saved to a database.
   *
   * @param {unknown} data - The data to stringify
   * @param {Set<unknown>} [visited=new Set()] - Set of visited objects (for circular reference detection)
   * @returns {unknown} - Data with properly stringified nested objects
   */
  export const normalizeToString = (data: unknown, visited: Set<unknown> = new Set()): unknown => {
    // Handle null or undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types (they don't need normalization)
    if (typeof data !== 'object') {
      return data;
    }

    // Handle Date objects (convert to ISO string)
    if (data instanceof Date) {
      return data.toISOString();
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => normalizeToString(item, new Set(visited)));
    }

    // At this point, we're dealing with a regular object

    // Check for circular references
    if (visited.has(data)) {
      return "[Circular Reference]";
    }

    // Add this object to the visited set
    visited.add(data);

    // Clone the object
    const result: Record<string, unknown> = {};
    const dataRecord = data as Record<string, unknown>;

    // Process each property
    for (const key in dataRecord) {
      if (Object.prototype.hasOwnProperty.call(dataRecord, key)) {
        const value = dataRecord[key];

        if (typeof value === 'object' && value !== null) {
          // For objects and arrays, decide if they should be stringified
          if (shouldStringifyProperty(key)) {
            // Convert to JSON string
            result[key] = JSON.stringify(normalizeToString(value, new Set(visited)));
          } else {
            // Keep as an object but normalize its contents
            result[key] = normalizeToString(value, new Set(visited));
          }
        } else {
          // For non-object properties, keep as is
          result[key] = value;
        }
      }
    }

    return result;
  };
  
  /**
   * Determines if a property should be converted to a JSON string based on naming conventions
   * You can customize this function to match your specific requirements
   * 
   * @param {string} propertyName - The name of the property
   * @returns {boolean} - True if the property should be stringified
   */
  const shouldStringifyProperty = (propertyName: string): boolean => {
    // Common naming patterns for properties that might need to be stringified
    const patternsThatShouldBeStrings = [
      'parsed_content',
      'content',
      'json',
      'data',
      'payload',
      'config',
      'settings',
      'metadata'
    ];
    
    // Check if the property name contains any of the patterns
    return patternsThatShouldBeStrings.some(pattern => 
      propertyName.toLowerCase().includes(pattern)
    );
  };
  
  /**
   * Safely converts any value to a JSON string, handling circular references
   *
   * @param {unknown} value - The value to convert to a JSON string
   * @returns {string} - A JSON string representation of the value
   */
  export const safeStringify = (value: unknown): string => {
    try {
      // Use a cache to detect circular references
      const cache = new Set<unknown>();

      return JSON.stringify(value, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular Reference]';
          }
          cache.add(value);
        }
        return value;
      }, 2);
    } catch (error) {
      console.error('Error stringifying value:', error);
      return JSON.stringify({ error: 'Error converting value to JSON' });
    }
  };

  /**
   * Safely parses a JSON string, returning null if parsing fails
   *
   * @param {unknown} jsonString - The JSON string to parse
   * @returns {unknown} - The parsed value, or null if parsing fails, or the input as-is if not a string
   */
  export const safeParse = (jsonString: unknown): unknown => {
    if (typeof jsonString !== 'string') {
      return jsonString; // Return as is if not a string
    }

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Error parsing JSON string:', error);
      return null;
    }
  };

  /**
   * Creates a fully normalized version of data that is both consistently
   * structured AND safely traversable with paths
   *
   * @param {unknown} data - The data to normalize
   * @returns {unknown} - A normalized and path-safe object
   */
  export const createNormalizedData = (data: unknown): unknown => {
    // First normalize to a proper object
    const normalized = normalizeToObject(data);

    // If we want to ensure specific fields are stringified, we can do it here
    // For example, ensuring parsed_content is a proper object, not a string
    if (
      normalized &&
      typeof normalized === 'object' &&
      'parsed_content' in normalized &&
      typeof (normalized as Record<string, unknown>).parsed_content === 'string'
    ) {
      const normalizedRecord = normalized as Record<string, unknown>;
      try {
        normalizedRecord.parsed_content = JSON.parse(normalizedRecord.parsed_content as string);
      } catch (e) {
        // Keep as string if parsing fails
      }
    }

    return normalized;
  };