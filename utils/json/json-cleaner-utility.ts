export const cleanJson = (
  data: unknown,
  indent = 2,
  returnAsString = false,
): unknown => {
  const cleanRecursively = (
    input: unknown,
    visited: WeakSet<object> = new WeakSet(),
  ): unknown => {
    // Handle null or non-object types (the `typeof === "object"` check above
    // means a string branch below is unreachable for non-JSON.parse'd input,
    // matching prior behavior — `typeof input === "string"` never holds here).
    if (input === null || typeof input !== "object") {
      return input;
    }

    // Check for circular reference
    if (visited.has(input)) {
      return null; // Replace circular references with null to ensure valid JSON
    }

    // Add current object to visited set
    visited.add(input);

    // Handle arrays
    if (Array.isArray(input)) {
      return input.map((item) => cleanRecursively(item, visited));
    }

    // Handle objects
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        cleanRecursively(value, visited),
      ]),
    );
  };

  const cleanedData = cleanRecursively(data);

  return returnAsString
    ? JSON.stringify(cleanedData, null, indent)
    : cleanedData;
};

export const formatJson = (data: unknown, indent = 2): string => {
  return cleanJson(data, indent, true) as string;
};

/** Deepest object/array nesting in `value` (0 for primitives). */
export function getJsonStructuralDepth(value: unknown): number {
  if (value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    if (value.length === 0) return 1;
    return 1 + Math.max(...value.map(getJsonStructuralDepth));
  }
  const vals = Object.values(value);
  if (vals.length === 0) return 1;
  return 1 + Math.max(...vals.map(getJsonStructuralDepth));
}

const INDENT_UNIT = "  ";

function withBlockIndent(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}

function stringifyAtExpandDepth(
  value: unknown,
  expandDepth: number,
  depth: number,
): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (depth >= expandDepth) {
    return JSON.stringify(value);
  }

  const innerPad = INDENT_UNIT.repeat(depth + 1);
  const closePad = INDENT_UNIT.repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) =>
      withBlockIndent(
        stringifyAtExpandDepth(item, expandDepth, depth + 1),
        innerPad,
      ),
    );
    return "[\n" + items.join(",\n") + "\n" + closePad + "]";
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const props = entries.map(([key, val]) => {
    const formatted = stringifyAtExpandDepth(val, expandDepth, depth + 1);
    if (formatted.includes("\n")) {
      return innerPad + JSON.stringify(key) + ": " + formatted;
    }
    return innerPad + JSON.stringify(key) + ": " + formatted;
  });
  return "{\n" + props.join(",\n") + "\n" + closePad + "}";
}

/**
 * Pretty-print JSON with progressive expansion. `expandDepth` controls how many
 * structural levels (objects/arrays) break onto multiple lines before deeper
 * nodes are inlined — nothing is omitted. 0 = minified single line.
 */
export function formatJsonAtExpandDepth(
  data: unknown,
  expandDepth: number,
): string {
  const cleaned = cleanJson(data);
  if (expandDepth <= 0) {
    return JSON.stringify(cleaned);
  }
  const maxDepth = getJsonStructuralDepth(cleaned);
  if (expandDepth >= maxDepth) {
    return formatJson(data, 2);
  }
  return stringifyAtExpandDepth(cleaned, expandDepth, 0);
}

/** Sensible default: expand enough to inline leaf objects, not every property. */
export function defaultJsonExpandDepth(data: unknown): number {
  const maxDepth = getJsonStructuralDepth(cleanJson(data));
  if (maxDepth <= 1) return maxDepth;
  return Math.min(maxDepth - 1, 2);
}
