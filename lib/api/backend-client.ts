// lib/api/backend-client.ts
// Core API client for the Python FastAPI backend.
// Pure TypeScript — no React dependency. Can be used from hooks, services, or scripts.

import type { AuthCredentials, ContextScope, TypedStreamEvent } from "./types";
import { BackendApiError, parseHttpError } from "./errors";
import { parseNdjsonStream, consumeStream } from "./stream-parser";
import type { StreamCallbacks } from "./stream-parser";
import { BACKEND_URLS, ENDPOINTS } from "./endpoints";

// ============================================================================
// CLIENT
// ============================================================================

/**
 * Configuration for creating a BackendClient instance.
 */
export interface BackendClientConfig {
  /** Backend base URL — use BACKEND_URLS.production or NEXT_PUBLIC_BACKEND_URL */
  baseUrl?: string;
  /** Authentication credentials */
  auth?: AuthCredentials;
  /** Org/project/task scope — merged into POST request bodies */
  scope?: ContextScope;
}

/**
 * Stateless API client for the Python FastAPI backend.
 *
 * Handles:
 * - Auth headers (Bearer token or X-Fingerprint-ID)
 * - Scope injection (org/project/task into request body)
 * - Standardized error parsing
 * - NDJSON streaming
 *
 * Usage:
 * ```typescript
 * const client = new BackendClient({
 *   baseUrl: BACKEND_URLS.production,
 *   auth: { type: 'token', token: 'eyJ...' },
 *   scope: { organization_id: 'org-123' },
 * });
 *
 * // JSON request
 * const data = await client.postJson('/ai/agents/{agentId}/warm', {});
 *
 * // Streaming request with async generator
 * for await (const event of client.stream('/ai/conversations/{conversationId}', body)) {
 *   if (event.event === 'chunk') console.log(event.data);
 * }
 *
 * // Streaming request with callbacks
 * await client.streamWithCallbacks('/ai/conversations/{conversationId}', body, {
 *   onChunk: (text) => setOutput(prev => prev + text),
 *   onError: (err) => setError(err.userMessage),
 *   onEnd: () => setDone(true),
 * });
 * ```
 */
export class BackendClient {
  private readonly baseUrl: string;
  private readonly auth: AuthCredentials;
  private readonly scope: ContextScope;

  constructor(config: BackendClientConfig = {}) {
    const resolvedBaseUrl = config.baseUrl ?? BACKEND_URLS.production;
    if (!resolvedBaseUrl) {
      throw new Error(
        "[BackendClient] No backend URL configured. Set NEXT_PUBLIC_BACKEND_URL_PROD or pass baseUrl.",
      );
    }
    this.baseUrl = resolvedBaseUrl;
    this.auth = config.auth || { type: "anonymous" };
    this.scope = config.scope || {};
  }

  // ========================================================================
  // PUBLIC METHODS
  // ========================================================================

  /**
   * POST request returning parsed JSON.
   * Scope is automatically merged into the request body.
   */
  async postJson<T = unknown>(
    endpoint: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.rawPost(endpoint, body, signal);
    return response.json() as Promise<T>;
  }

  /**
   * POST request returning the raw Response.
   * Use this for streaming — call `stream()` or `streamWithCallbacks()` instead
   * unless you need the raw Response for custom handling.
   */
  async rawPost(
    endpoint: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const mergedBody = this.mergeScope(body);

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(mergedBody),
      signal,
    });

    if (!response.ok) {
      throw await parseHttpError(response);
    }

    return response;
  }

  /**
   * GET request returning parsed JSON.
   */
  async getJson<T = unknown>(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.rawGet(endpoint, signal);
    return response.json() as Promise<T>;
  }

  /**
   * GET request returning the raw Response.
   */
  async rawGet(endpoint: string, signal?: AbortSignal): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
      signal,
    });

    if (!response.ok) {
      throw await parseHttpError(response);
    }

    return response;
  }

  /**
   * Upload (multipart form data).
   * No Content-Type header — browser sets it with boundary.
   * Scope is NOT merged into FormData (it's for JSON bodies only).
   */
  async upload<T = unknown>(
    endpoint: string,
    formData: FormData,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.buildHeaders(false);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      throw await parseHttpError(response);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Streaming POST request — returns an async generator of typed events
   * and the X-Request-ID for cancellation support.
   * Scope is automatically merged into the request body.
   */
  async stream(
    endpoint: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<{
    events: AsyncGenerator<TypedStreamEvent, void, undefined>;
    requestId: string | null;
    conversationId: string | null;
  }> {
    const response = await this.rawPost(endpoint, body, signal);
    return parseNdjsonStream(response, signal);
  }

  /**
   * Streaming POST request with callback-based consumption.
   * Convenience wrapper for components that prefer callbacks.
   */
  async streamWithCallbacks(
    endpoint: string,
    body: Record<string, unknown> = {},
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<{ requestId: string | null }> {
    const response = await this.rawPost(endpoint, body, signal);
    return consumeStream(response, callbacks, signal);
  }

  /**
   * Cancel a running server-side request by its request ID.
   * The request ID comes from the X-Request-ID response header
   * returned by streaming endpoints.
   *
   * This is a best-effort operation — it may fail silently if
   * the request has already completed or the server is unreachable.
   */
  async cancelRequest(requestId: string): Promise<void> {
    try {
      const url = `${this.baseUrl}${ENDPOINTS.ai.cancel(requestId)}`;
      await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
      });
    } catch {
      // Best-effort — don't propagate cancel failures
    }
  }

  // ========================================================================
  // CONFIGURATION
  // ========================================================================

  /** Get the current base URL */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Get the current auth type */
  getAuthType(): AuthCredentials["type"] {
    return this.auth.type;
  }

  /** Check if we have any auth credentials */
  hasAuth(): boolean {
    return this.auth.type !== "anonymous";
  }

  /**
   * Create a new client with different configuration.
   * Immutable — returns a new instance.
   */
  withConfig(overrides: Partial<BackendClientConfig>): BackendClient {
    return new BackendClient({
      baseUrl: overrides.baseUrl ?? this.baseUrl,
      auth: overrides.auth ?? this.auth,
      scope: overrides.scope ?? this.scope,
    });
  }

  // ========================================================================
  // INTERNAL
  // ========================================================================

  private buildHeaders(includeContentType = true): Record<string, string> {
    const headers: Record<string, string> = {};

    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    switch (this.auth.type) {
      case "token":
        headers["Authorization"] = `Bearer ${this.auth.token}`;
        break;
      case "fingerprint":
        headers["X-Fingerprint-ID"] = this.auth.fingerprintId;
        break;
      // 'anonymous' — no auth headers
    }

    return headers;
  }

  private mergeScope(body: Record<string, unknown>): Record<string, unknown> {
    const merged = { ...body };

    // Only include scope fields that are defined and non-empty
    if (this.scope.organization_id) {
      merged.organization_id = this.scope.organization_id;
    }
    if (this.scope.project_id) {
      merged.project_id = this.scope.project_id;
    }
    if (this.scope.task_id) {
      merged.task_id = this.scope.task_id;
    }

    return merged;
  }
}

// ============================================================================
// FACTORY — Quick client creation for common cases
// ============================================================================

/** Create a client with no auth (for public endpoints like health, warm) */
export function createPublicClient(baseUrl?: string): BackendClient {
  return new BackendClient({ baseUrl });
}

/** Create a client with a JWT token */
export function createAuthenticatedClient(
  token: string,
  baseUrl?: string,
  scope?: ContextScope,
): BackendClient {
  return new BackendClient({
    baseUrl,
    auth: { type: "token", token },
    scope,
  });
}

/** Create a client with a fingerprint (guest) */
export function createGuestClient(
  fingerprintId: string,
  baseUrl?: string,
  scope?: ContextScope,
): BackendClient {
  return new BackendClient({
    baseUrl,
    auth: { type: "fingerprint", fingerprintId },
    scope,
  });
}
