/**
 * Backend capabilities that have verified, deployed REST contracts.
 *
 * Keep unsupported controls visibly gated until aidream exposes the matching
 * routes. This prevents a "coming soon" surface from issuing guaranteed 404s.
 */
export const IMAGE_STUDIO_BACKEND_CAPABILITIES = {
  // POST /images/generate shipped 2026-08-08 (aidream streaming wrapper
  // over execute_ai_request; NDJSON drained by generateImage()).
  generate: true,
  faceDetection: false,
  promptEdit: false,
  editSuggestions: false,
} as const;
