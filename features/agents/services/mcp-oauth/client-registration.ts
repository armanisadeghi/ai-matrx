/**
 * Client ID Metadata Documents are opt-in provider behavior. Treat absence,
 * strings, and malformed metadata as unsupported so OAuth fails closed instead
 * of sending a URL-shaped client_id to a provider that requires registration.
 */
export function supportsClientIdMetadataDocument(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (
    (metadata as Record<string, unknown>)[
      "oauth_client_id_metadata_document_supported"
    ] === true
  );
}
