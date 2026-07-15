const CONTENT_METADATA_KEY =
  /(^|_)(content|text|snippet|body|summary|abstract|header|caption|title|question|answer|embedding|vector|prompt|response)(_|$)/i;

/**
 * Preserve scalar provenance and identity metadata for Copy for AI while
 * recursively removing fields that can contain retrieved document content.
 */
export function factsOnlyMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(factsOnlyMetadata);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CONTENT_METADATA_KEY.test(key))
      .map(([key, nested]) => [key, factsOnlyMetadata(nested)]),
  );
}
