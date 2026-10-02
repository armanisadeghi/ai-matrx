/**
 * Common Types & Patterns
 *
 * Shared patterns used across multiple slices.
 */

// =============================================================================
// Dirty Tracking
// =============================================================================

/**
 * Every source slice (Layer 1) tracks dirty state per entity.
 * This enables granular save operations — if only settings changed,
 * only settings get pushed to the DB.
 */
export interface DirtyTrackable {
    /** Set of entity IDs that have unsaved changes */
    dirtyIds: Record<string, boolean>;
}

/**
 * Standard loading/error state for async operations.
 */
export interface AsyncState {
    loading: boolean;
    error: string | null;
}

/**
 * Combines entity data with dirty tracking and async state.
 * This is the standard shape for all Layer 1 slices.
 */
export interface SourceSliceState<T> extends DirtyTrackable, AsyncState {
    byId: Record<string, T>;
    allIds: string[];
}

/**
 * Standard shape for Layer 3 (conversation) slices.
 * No dirty tracking needed — conversations are ephemeral client-side entities.
 */
export interface ConversationSliceState<T> {
    byConversationId: Record<string, T>;
}

/** @deprecated Use ConversationSliceState */
export type InstanceSliceState<T> = ConversationSliceState<T>;

// =============================================================================
// Utility Types
// =============================================================================

/** Payload pattern for actions targeting a specific agent */
export interface AgentPayload<T> {
    agentId: string;
    data: T;
}

/** Payload pattern for actions targeting a specific conversation */
export interface ConversationPayload<T> {
    conversationId: string;
    data: T;
}

/** @deprecated Use ConversationPayload */
export type InstancePayload<T> = ConversationPayload<T>;
