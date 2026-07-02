// lib/api/errors.ts
// Centralized error handling for the Python FastAPI backend.
// Parses both HTTP error responses and streaming error events
// into a consistent BackendApiError shape.

import type { BackendApiErrorData, BackendErrorCode } from './types';

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Typed error thrown by all backend API operations.
 * Contains structured fields matching the Python APIError model.
 *
 * Usage:
 * ```typescript
 * try {
 *   await client.post(ENDPOINTS.ai.agentStart(agentId), body);
 * } catch (err) {
 *   if (err instanceof BackendApiError) {
 *     // Show err.userMessage to the user
 *     // Log err.requestId for debugging
 *     // Check err.code for programmatic handling
 *   }
 * }
 * ```
 */
export class BackendApiError extends Error {
    /** Machine-readable error code */
    readonly code: BackendErrorCode;
    /** Developer-facing detail */
    readonly detail: string;
    /** Safe to display directly in the UI */
    readonly userMessage: string;
    /** Extra info (validation errors, etc.) */
    readonly details: unknown | null;
    /** Unique request ID for support/debugging */
    readonly requestId: string;
    /** HTTP status code (if from an HTTP response) */
    readonly status: number | null;

    constructor(data: {
        code: BackendErrorCode;
        detail: string;
        userMessage: string;
        details?: unknown | null;
        requestId?: string;
        status?: number | null;
    }) {
        super(data.userMessage);
        this.name = 'BackendApiError';
        this.code = data.code;
        this.detail = data.detail;
        this.userMessage = data.userMessage;
        this.details = data.details ?? null;
        // MATRX-EXCEPTION: requestId is genuinely optional (constructor param);
        // "" means "no request id available" — a display/log field, not persisted.
        this.requestId = data.requestId ?? '';
        this.status = data.status ?? null;
    }

    /** Convert to the wire format for logging */
    toJSON(): BackendApiErrorData {
        return {
            error: this.code,
            message: this.detail,
            user_message: this.userMessage,
            details: this.details,
            request_id: this.requestId,
        };
    }
}

// ============================================================================
// HTTP ERROR PARSER
// ============================================================================

/**
 * Parse a non-OK HTTP response into a BackendApiError.
 *
 * Handles the standardized backend shape and falls back gracefully
 * when the response isn't JSON or uses a legacy format.
 */
export async function parseHttpError(response: Response): Promise<BackendApiError> {
    const status = response.status;
    let body: Record<string, unknown> | null = null;

    try {
        body = await response.json();
    } catch {
        // Not JSON — try plain text
        try {
            const text = await response.text();
            return new BackendApiError({
                code: statusToCode(status),
                detail: text || `HTTP ${status}`,
                userMessage: text || `Request failed (${status})`,
                status,
            });
        } catch {
            return new BackendApiError({
                code: statusToCode(status),
                detail: `HTTP ${status}`,
                userMessage: `Request failed (${status})`,
                status,
            });
        }
    }

    if (!body) {
        return new BackendApiError({
            code: statusToCode(status),
            detail: `HTTP ${status}`,
            userMessage: `Request failed (${status})`,
            status,
        });
    }

    // Standard backend shape: { error, message, user_message, details, request_id }
    if (typeof body.error === 'string' && typeof body.user_message === 'string') {
        return new BackendApiError({
            code: body.error as BackendErrorCode,
            detail: (body.message as string) || `HTTP ${status}`,
            userMessage: body.user_message as string,
            details: body.details ?? null,
            requestId: typeof body.request_id === 'string' ? body.request_id : undefined,
            status,
        });
    }

    // Legacy: nested error object with user_visible_message
    if (typeof body.error === 'object' && body.error !== null) {
        const errorObj = body.error as Record<string, unknown>;
        return new BackendApiError({
            code: (errorObj.type as string) || (errorObj.error as string) || statusToCode(status),
            detail: (errorObj.message as string) || `HTTP ${status}`,
            userMessage:
                (errorObj.user_message as string) ||
                (errorObj.user_visible_message as string) ||
                (errorObj.message as string) ||
                `Request failed (${status})`,
            details: errorObj.details ?? null,
            requestId: typeof errorObj.request_id === 'string' ? errorObj.request_id : undefined,
            status,
        });
    }

    // Legacy: flat { error: string, message: string } or { detail: string }
    return new BackendApiError({
        code: typeof body.error === 'string' ? body.error : statusToCode(status),
        detail:
            (body.message as string) ||
            (body.detail as string) ||
            (body.error as string) ||
            `HTTP ${status}`,
        userMessage:
            (body.user_message as string) ||
            (body.user_visible_message as string) ||
            (body.message as string) ||
            (body.detail as string) ||
            `Request failed (${status})`,
        details: body.details ?? null,
        requestId: typeof body.request_id === 'string' ? body.request_id : undefined,
        status,
    });
}

// ============================================================================
// STREAMING ERROR PARSER
// ============================================================================

/**
 * Parse streaming error event data into a BackendApiError.
 *
 * Handles both new format (`user_message`) and legacy (`user_visible_message`).
 */
export function parseStreamError(data: unknown): BackendApiError {
    if (!data || typeof data !== 'object') {
        return new BackendApiError({
            code: 'internal_error',
            detail: typeof data === 'string' ? data : 'Unknown streaming error',
            userMessage: typeof data === 'string' ? data : 'Something went wrong',
        });
    }

    const obj = data as Record<string, unknown>;
    return new BackendApiError({
        code: (obj.error_type as string) || (obj.error as string) || 'internal_error',
        detail: (obj.message as string) || 'Streaming error',
        userMessage:
            (obj.user_message as string) ||
            (obj.message as string) ||
            'Something went wrong',
        details: obj.details ?? null,
        requestId: typeof obj.request_id === 'string' ? obj.request_id : undefined,
    });
}

/**
 * Extract a user-visible message from any error object.
 * Utility for components that just need the display string.
 */
export function getUserMessage(error: unknown): string {
    if (error instanceof BackendApiError) {
        return error.userMessage;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Something went wrong';
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function statusToCode(status: number): BackendErrorCode {
    switch (status) {
        case 401:
            return 'auth_required';
        case 403:
            return 'admin_required';
        case 404:
            return 'not_found';
        case 422:
            return 'validation_error';
        default:
            return 'internal_error';
    }
}
