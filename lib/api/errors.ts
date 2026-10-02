// lib/api/errors.ts
// The AI Matrx server's error model MOVED into `@ai-matrx/agents/matrx`
// (`backend-errors`, chat-package independence P9): one implementation for every
// client. Re-exported here so this app's import sites keep their path. Grow it in
// the package, never here.

export {
  BackendApiError,
  StreamTransportError,
  isStreamTransportLost,
  parseHttpError,
  parseHttpErrorBody,
  parseCallApiError,
  parseStreamError,
  parsePersistedBackendError,
  isGenericUserMessage,
  unwrapUpstreamError,
  describeBackendFailure,
  getUserMessage,
  type UpstreamErrorPayload,
  type BackendFailureExplanation,
} from "@ai-matrx/agents/matrx";
