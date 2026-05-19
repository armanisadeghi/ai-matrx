/**
 * Context State Selectors
 *
 * One memoized selector per derived field. The slice itself stays simple;
 * everything the UI needs to render the Model Context tab + header gauge
 * is computed here so components do zero arithmetic at render time.
 */

import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/lib/redux/store";
import type { ContextStateEntry } from "./context-state.slice";

// Conservative chars-per-token estimate for FE display. Matches the Python
// CHARS_PER_TOKEN_ESTIMATE constant — keep them aligned so the gauge and
// the cache-aware gate agree on what "5K tokens trimmable" means.
const CHARS_PER_TOKEN_ESTIMATE = 4;

// Context-window ceiling per model. Phase 4 minimum — we'll move this to a
// dynamic lookup driven by the ai_model registry in a later pass. For now,
// keep one conservative default the gauge can render against.
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;

const empty: ContextStateEntry | null = null;

const EMPTY_BY_CONVERSATION: Record<string, ContextStateEntry> = {};

const selectSliceMap = (state: RootState) =>
  state.contextState?.byConversationId ?? EMPTY_BY_CONVERSATION;

export const selectContextState = (conversationId: string) =>
  createSelector(
    [selectSliceMap],
    (map): ContextStateEntry | null => map[conversationId] ?? empty,
  );

/**
 * "Live fill" estimate in tokens — combines real last-request usage with
 * a char-based estimate of total visible chars. We anchor on the real
 * input_tokens count because the provider just reported it; the chars
 * estimate is a fallback for parts the gauge couldn't measure precisely.
 */
export const selectEstimatedTokens = (conversationId: string) =>
  createSelector([selectContextState(conversationId)], (entry): number => {
    if (!entry) return 0;
    // Real input tokens from the last persisted turn is the strongest signal —
    // it reflects exactly what the provider just counted. Use it when present;
    // fall back to a char-based estimate when no requests have landed yet.
    if (entry.lastRequestInputTokens > 0) {
      return entry.lastRequestInputTokens + entry.lastRequestCachedTokens;
    }
    return Math.ceil(entry.totalCharsVisibleToModel / CHARS_PER_TOKEN_ESTIMATE);
  });

/**
 * Fill ratio 0..1 against the conversation's context-window ceiling.
 * Phase 4 uses a flat default; later phases swap in a per-model lookup.
 */
export const selectContextFillRatio = (
  conversationId: string,
  windowTokens: number = DEFAULT_CONTEXT_WINDOW_TOKENS,
) =>
  createSelector([selectEstimatedTokens(conversationId)], (est): number => {
    if (!windowTokens || windowTokens <= 0) return 0;
    return Math.min(1, est / windowTokens);
  });

/** "Cache likely alive" approximation — mirrors the Python gate logic. */
export const selectCacheLikelyAlive = (conversationId: string) =>
  createSelector([selectContextState(conversationId)], (entry): boolean => {
    if (!entry) return false;
    const last = entry.cacheState.last_response_at;
    if (!last) return false;
    const ttl = entry.cacheState.est_cache_ttl_secs ?? 300;
    const ageSecs = (Date.now() - new Date(last).getTime()) / 1000;
    return ageSecs < ttl * 0.8;
  });

/** Seconds remaining on the cache window estimate (0 when expired). */
export const selectCacheSecondsRemaining = (conversationId: string) =>
  createSelector([selectContextState(conversationId)], (entry): number => {
    if (!entry) return 0;
    const last = entry.cacheState.last_response_at;
    if (!last) return 0;
    const ttl = entry.cacheState.est_cache_ttl_secs ?? 300;
    const ageSecs = (Date.now() - new Date(last).getTime()) / 1000;
    return Math.max(0, Math.floor(ttl - ageSecs));
  });

export const selectLastTrimSummary = (conversationId: string) =>
  createSelector(
    [selectContextState(conversationId)],
    (entry) => entry?.lastTrimSummary ?? null,
  );

export const selectLastRawUsage = (conversationId: string) =>
  createSelector(
    [selectContextState(conversationId)],
    (entry) => entry?.lastRawUsage ?? null,
  );
