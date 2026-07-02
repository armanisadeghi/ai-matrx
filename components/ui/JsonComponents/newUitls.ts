// jsonUtils.ts
import JSON5 from 'json5';
import type { JsonValue, JsonObject } from '@/types/json';

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

export interface ParseResult {
  data: JsonValue;
  error?: string;
}

export const jsonUtils = {
  /**
   * Core parsing function - uses JSON5 for more permissive parsing
   */
  parse(input: unknown): ParseResult {
    try {
      // Already an object
      if (typeof input === 'object' && input !== null) {
        return { data: input as JsonValue };
      }

      // Empty/null checks
      if (input === null || input === undefined || input === '') {
        return { data: {} };
      }

      // Convert to string and parse with JSON5
      const stringValue = String(input).trim();
      const data = JSON5.parse(stringValue) as JsonValue;
      return { data };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Invalid JSON'
      };
    }
  },

  /**
   * Stringify with formatting options
   */
  stringify(data: JsonValue | undefined, pretty = true): string {
    if (data === undefined) return '';
    if (data === null) return 'null';

    try {
      return pretty ? JSON5.stringify(data, null, 2) : JSON5.stringify(data);
    } catch (err) {
      return String(data);
    }
  },

  /**
   * Validate JSON and return any errors
   */
  validate(input: unknown): ValidationError[] {
    try {
      if (typeof input === 'object') {
        JSON5.stringify(input);
        return [];
      }

      JSON5.parse(String(input));
      return [];
    } catch (err) {
      const error = err as Error;
      const match = error.message.match(/line (\d+) column (\d+)/);

      return [{
        message: error.message,
        line: match ? parseInt(match[1], 10) : undefined,
        column: match ? parseInt(match[2], 10) : undefined
      }];
    }
  },

  /**
   * Transform operations on JSON objects
   */
  transform(
    data: JsonObject,
    operation: 'edit' | 'add' | 'delete',
    path: string[],
    value?: JsonValue
  ): JsonObject {
    const result: JsonObject = { ...data };
    let current: JsonObject | JsonValue[] = result;
    const lastIndex = path.length - 1;

    for (let i = 0; i < lastIndex; i++) {
      const key = path[i];
      const nested: JsonValue | undefined = (current as JsonObject)[key];
      const clonedNested: JsonObject | JsonValue[] = Array.isArray(nested)
        ? [...nested]
        : { ...(nested as JsonObject) };
      (current as JsonObject)[key] = clonedNested;
      current = clonedNested;
    }

    const lastKey = path[lastIndex];
    switch (operation) {
      case 'edit':
        (current as JsonObject)[lastKey] = value;
        break;
      case 'add':
        if (Array.isArray(current)) {
          current.splice(parseInt(lastKey), 0, value ?? null);
        } else {
          current[lastKey] = value;
        }
        break;
      case 'delete':
        if (Array.isArray(current)) {
          current.splice(parseInt(lastKey), 1);
        } else {
          delete current[lastKey];
        }
        break;
    }

    return result;
  },

  /**
   * Tree navigation helpers
   */
  tree: {
    getAllKeys(obj: JsonValue, prefix = ''): string[] {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return [];
      }

      return Object.entries(obj).reduce((keys: string[], [key, value]) => {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        keys.push(currentPath);

        if (value && typeof value === 'object') {
          keys.push(...this.getAllKeys(value, currentPath));
        }

        return keys;
      }, []);
    },

    getValueAtPath(obj: JsonValue, path: string[]): JsonValue | undefined {
      return path.reduce<JsonValue | undefined>((current, key) =>
        current && typeof current === 'object' && !Array.isArray(current)
          ? current[key]
          : undefined,
        obj
      );
    }
  }
};

// Export the default instance
export default jsonUtils;

// Also export individual functions for convenience
export const { parse, stringify, validate, transform } = jsonUtils;