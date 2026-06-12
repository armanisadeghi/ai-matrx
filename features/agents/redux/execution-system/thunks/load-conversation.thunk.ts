/**
 * loadConversation — single-entry rehydration of a conversation from the DB.
 *
 * Fetches everything needed to reopen a past conversation and dispatches into
 * the 6 per-conversation dimensions: conversation record, messages, variables
 * (persisted values), model overrides (persisted values), display/context
 * (from metadata), and observability (cx_user_request / cx_request /
 * cx_tool_call records).
 *
 * Primary RPC: `get_cx_conversation_bundle(conversation_id uuid, ...)` — a
 * single round-trip that returns the full bundle. The shared bundle
 * fetcher in `./conversation-bundle.ts` handles RPC + fallback for both
 * this thunk and `loadOlderMessages`.
 *
 * Paginated history fetches live in `./load-older-messages.thunk.ts`. This
 * thunk seeds the older-page cursor via the `pagination` block from the
 * bundle so the scroll sentinel knows whether older history exists.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";

import {
  hydrateConversation,
  setConversationLabel,
} from "../conversations/conversations.slice";
import { hydrateMessages, updateMessageRecord } from "../messages/messages.slice";
import { reconcileMessagesArtifacts } from "@/features/canvas/materialization/reconcileArtifacts";
import type { Json } from "@/types/database.types";
import { hydrateObservability } from "../observability/observability.slice";
import { hydrateRequestsFromObservability } from "../active-requests/active-requests.slice";
import {
  initInstanceVariables,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import {
  initInstanceOverrides,
  setOverrides,
} from "../instance-model-overrides/instance-model-overrides.slice";
import { initInstanceUIState } from "../instance-ui-state/instance-ui-state.slice";
import {
  initInstanceContext,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import { setFocus } from "../conversation-focus/conversation-focus.slice";
import {
  setMemoryMetadata,
  type ObservationalMemoryMetadata,
} from "../observational-memory/observational-memory.slice";
import { loadCodeEditHistoryThunk } from "@/features/code/redux/codeEditHistoryHydration";
import {
  fetchConversationBundle,
  describeSupabaseError,
  extractBundleToolCalls,
  messageRowToRecord,
  toolCallRowToRecord,
  userRequestRowToRecord,
  requestRowToRecord,
  type CxConversationBundle,
  type CxUserRequestRow,
  type CxRequestRow,
} from "./conversation-bundle";

// =============================================================================
// Thunk
// =============================================================================

export interface LoadConversationArgs {
  conversationId: string;
  /** Optional — surface key to set focus on after rehydration. */
  surfaceKey?: string;
  /**
   * How many recent messages to fetch. Forwarded to the
   * `get_cx_conversation_bundle(..., p_message_limit, ...)` RPC arg. RPC
   * clamps to [1, 200]. Default 50.
   */
  messageLimit?: number;
  /**
   * Optional cursor: only fetch messages with `position < beforePosition`.
   * Used for pagination when scrolling older turns into view.
   */
  beforePosition?: number | null;
  /**
   * Optional abort signal from the calling surface. When it's aborted (the
   * surface navigated away before this load resolved), the terminal `setFocus`
   * is skipped — otherwise a late-resolving load reverts the surface back to
   * this conversation after the user already moved on (e.g. clicked `+`).
   */
  signal?: AbortSignal;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * Rehydrates a single conversation from the DB. Restores all six dimensions:
 *   - `conversations/` — identity, scope, sidebar fields, invocation origin
 *   - `messages/` — DB-faithful MessageRecords, ordered by position
 *   - `variables/` — `persistedValues` from cx_conversation.variables
 *   - `modelConfig/` — base + persisted overrides + last_model_id
 *   - `context/` — from cx_conversation.metadata.context
 *   - `observability/` — cx_user_request + cx_request + cx_tool_call records
 *
 * Also sets focus on the given surface (if provided), so the UI can point the
 * user directly at the rehydrated conversation.
 */
export const loadConversation = createAsyncThunk<
  { conversationId: string },
  LoadConversationArgs,
  ThunkApi
>(
  "conversations/load",
  async (
    { conversationId, surfaceKey, messageLimit, beforePosition, signal },
    { dispatch },
  ) => {
    // Auth diagnostics — RLS-denied reads return as `PGRST116` with
    // empty-looking errors. Most common root cause: browser session
    // not hydrated when the thunk fires.
    let authedUserId: string | null = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      authedUserId = authData?.user?.id ?? null;
      // eslint-disable-next-line no-console
      console.log(
        "[loadConversation] auth at fetch time: userId=%s conversationId=%s",
        authedUserId ?? "(none)",
        conversationId,
      );
    } catch (authErr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[loadConversation] auth.getUser() threw:",
        describeSupabaseError(authErr),
      );
    }

    // Kick off the AI edit-history fetch in parallel with the
    // conversation bundle. We don't await the result here — the
    // history hook hydrates the slice itself, and the chat surface
    // doesn't depend on history rows for its first paint.
    const historyPromise = dispatch(loadCodeEditHistoryThunk(conversationId));

    let bundle: CxConversationBundle;
    try {
      bundle = await fetchConversationBundle(conversationId, {
        messageLimit,
        beforePosition,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[loadConversation] fetchConversationBundle failed:",
        describeSupabaseError(err),
      );
      // Don't leave the history fetch dangling on a bundle failure.
      void historyPromise;
      throw err;
    }
    // Surface a single dev-only warning if the history fetch fails
    // separately from the bundle — never block hydration on it.
    void historyPromise.catch?.(() => undefined);
    const conv = bundle.conversation;
    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] bundle received: conv=%s messages=%d toolCalls=%d",
    //   conv?.id ?? "(none)",
    //   bundle.messages?.length ?? 0,
    //   bundle.tool_calls?.length ?? 0,
    // );

    // ── 1. Conversation record (includes sidebar + scope + relation fields) ──
    dispatch(
      hydrateConversation({
        conversationId,
        agentId: conv.initial_agent_id ?? "",
        agentType: "user",
        origin: "manual",
        shortcutId: null,
        status: "ready",
        sourceApp: conv.source_app,
        // Cast is safe — source_feature is stored as a plain string on the row
        // but the client-side type narrows to a known enum.
        sourceFeature: conv.source_feature as never,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        userId: conv.user_id,
        initialAgentId: conv.initial_agent_id,
        initialAgentVersionId: conv.initial_agent_version_id,
        lastModelId: conv.last_model_id,
        parentConversationId: conv.parent_conversation_id,
        forkedFromId: conv.forked_from_id,
        forkedAtPosition: conv.forked_at_position,
        organizationId: conv.organization_id,
        projectId: conv.project_id,
        taskId: conv.task_id,
        isEphemeral: conv.is_ephemeral,
        isPublic: conv.is_public,
        title: conv.title,
        description: conv.description,
        keywords: conv.keywords,
        systemInstruction: conv.system_instruction,
        persistedStatus: conv.status === "archived" ? "archived" : "active",
        messageCount: conv.message_count,
        metadata:
          typeof conv.metadata === "object" && conv.metadata !== null
            ? (conv.metadata as Record<string, unknown>)
            : undefined,
        // Per-conversation sandbox override. rowId lives on the FK column;
        // proxyUrl is mirrored into metadata by the write thunk so the
        // binding resolves with no extra fetch on reload. Both required —
        // a missing proxyUrl falls through to the user-active sandbox.
        sandboxOverride: (() => {
          const rowId = conv.sandbox_instance_id;
          if (!rowId) return null;
          const meta =
            typeof conv.metadata === "object" && conv.metadata !== null
              ? (conv.metadata as Record<string, unknown>)
              : {};
          const proxyUrl = meta["sandbox_override_proxy_url"];
          const tier = meta["sandbox_override_tier"];
          return typeof proxyUrl === "string" && proxyUrl
            ? {
                rowId,
                proxyUrl,
                tier: tier === "ec2" || tier === "hosted" ? tier : undefined,
              }
            : null;
        })(),
      }),
    );

    // Label (title/description/keywords) — already set above, but also fire the
    // dedicated action so any subscribers waiting on that signal get notified.
    dispatch(
      setConversationLabel({
        conversationId,
        title: conv.title,
        description: conv.description,
        keywords: conv.keywords,
      }),
    );

    // ── 2. Messages (DB-faithful) ────────────────────────────────────────────
    const messageRecords = bundle.messages.map(messageRowToRecord);
    const pagination = bundle.pagination;
    dispatch(
      hydrateMessages({
        conversationId,
        messages: messageRecords,
        pagination: pagination
          ? {
              oldestPosition: pagination.oldest_position,
              hasMoreOlder: pagination.has_more,
            }
          : undefined,
      }),
    );

    // ── Artifact reconciliation (owner-only, fire-and-forget) ───────────────
    // Materialize any assistant messages that still carry raw artifact markup
    // (historical messages, or live materialization that didn't finish). Idempotent
    // + recoverable (cx_message_edit archives the original into content_history),
    // so it's safe to run on every load. Owner-only: a viewer must never mint
    // canvas_items rows for someone else's conversation.
    if (authedUserId && conv.user_id === authedUserId) {
      void reconcileMessagesArtifacts(
        messageRecords
          .filter((r) => r.role === "assistant" || (r.role as string) === "output")
          .map((r) => ({
            id: r.id,
            conversationId,
            content: r.content,
          })),
      )
        .then((rewrites) => {
          for (const { messageId, rewrittenContent } of rewrites) {
            dispatch(
              updateMessageRecord({
                conversationId,
                messageId,
                patch: { content: rewrittenContent as unknown as Json },
              }),
            );
          }
        })
        .catch((err) => {
          console.error("[loadConversation] artifact reconcile failed:", err);
        });
    }

    // ── 3. Variables — stamp the DB `variables` JSON into userValues so the
    // user picks up right where they left off. A future pass can introduce a
    // dedicated `persistedValues` field on the entry to distinguish "server
    // said this was last-set" from "user just typed it"; today they're the
    // same on the reload path by construction.
    dispatch(
      initInstanceVariables({
        conversationId,
        definitions: [],
        scopeValues: {},
      }),
    );
    const persistedVariables =
      typeof conv.variables === "object" && conv.variables !== null
        ? (conv.variables as Record<string, unknown>)
        : {};
    if (Object.keys(persistedVariables).length > 0) {
      dispatch(
        setUserVariableValues({
          conversationId,
          values: persistedVariables,
        }),
      );
    }

    // ── 4. Model config (overrides + last model id) ──────────────────────────
    // Seed the base model from the conversation's last_model_id so the model
    // picker has a base to diff against — picking that same model on a resumed
    // conversation must NOT ship a config_overrides.model equal to the default.
    // (Settings base stays empty here: the server applies the agent defaults
    // and conv.overrides carries the persisted setting deltas.)
    dispatch(
      initInstanceOverrides({
        conversationId,
        baseSettings: conv.last_model_id ? { model: conv.last_model_id } : {},
      }),
    );
    if (
      typeof conv.overrides === "object" &&
      conv.overrides !== null &&
      Object.keys(conv.overrides as Record<string, unknown>).length > 0
    ) {
      dispatch(
        setOverrides({
          conversationId,
          changes: conv.overrides as Record<string, unknown>,
        }),
      );
    }

    // ── 5. Display + context (stored under metadata.display / metadata.context
    //      per the Phase 7 decision — config is server-strict) ────────────────
    const metaObj =
      typeof conv.metadata === "object" && conv.metadata !== null
        ? (conv.metadata as Record<string, unknown>)
        : {};
    const displayMeta =
      (metaObj.display as Record<string, unknown> | undefined) ?? undefined;
    if (displayMeta) {
      dispatch(
        initInstanceUIState({
          conversationId,
          ...displayMeta,
        } as never),
      );
    }

    const contextMeta =
      (metaObj.context as Record<string, unknown> | undefined) ?? undefined;
    if (contextMeta) {
      dispatch(initInstanceContext({ conversationId }));
      dispatch(
        setContextEntries({
          conversationId,
          entries: Object.entries(contextMeta).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      );
    }

    // ── 5b. Observational Memory (admin-gated per-conversation feature) ──────
    // The `observational_memory` block on cx_conversation.metadata persists the
    // admin's enable/disable + model + scope choices across turns. Hydrating
    // it here ensures the Creator Panel toggle and the ObservationalMemory
    // window both reflect the server-confirmed state the moment a past
    // conversation is reopened.
    const memoryMeta = metaObj.observational_memory as
      | ObservationalMemoryMetadata
      | undefined
      | null;
    if (memoryMeta && typeof memoryMeta === "object") {
      dispatch(
        setMemoryMetadata({
          conversationId,
          metadata: memoryMeta,
        }),
      );
    }

    // ── 6. Observability ─────────────────────────────────────────────────────
    // `extractBundleToolCalls` accepts both `tool_calls` (snake_case, RPC
    // contract) and `toolCalls` (camelCase) so the slice never silently
    // drops data if the server shifts conventions.
    const rawToolCalls = extractBundleToolCalls(bundle);
    const bundleAny = bundle as unknown as {
      userRequests?: CxUserRequestRow[];
      user_requests?: CxUserRequestRow[];
      requests?: CxRequestRow[];
    };
    const rawUserRequests =
      bundleAny.userRequests ?? bundleAny.user_requests ?? [];
    const rawRequests = bundleAny.requests ?? [];

    if (
      rawToolCalls.length === 0 &&
      bundle.messages.some((m) => m.role === "tool")
    ) {
      // The conversation has tool turns but the bundle returned zero
      // cx_tool_call rows — args/results will appear empty. This is a
      // server-side fetch problem (RPC missing the join, RLS hiding
      // rows, or field-name drift). Surface it loudly so we don't
      // silently render empty tool cards.
      // eslint-disable-next-line no-console
      console.warn(
        "[loadConversation] cid=%s has tool messages but bundle.tool_calls is empty — check RPC return shape",
        conversationId,
      );
    }

    const userRequestRecords = rawUserRequests.map(userRequestRowToRecord);
    dispatch(
      hydrateObservability({
        conversationId,
        userRequests: userRequestRecords,
        requests: rawRequests.map(requestRowToRecord),
        toolCalls: rawToolCalls.map(toolCallRowToRecord),
      }),
    );

    // Seed the in-memory activeRequests slice from those rows so the
    // post-stream UI (ResponseFeedbackBar's inline usage strip, the
    // Runs comparison table) keeps showing tokens / cost / timing
    // after a page reload. Without this seed `byRequestId` would stay
    // empty and the comparison UI would silently zero out — the
    // numbers themselves are persisted on cx_user_request and just
    // need to be replayed into the slice the UI reads from.
    if (userRequestRecords.length > 0) {
      dispatch(
        hydrateRequestsFromObservability({
          conversationId,
          rows: userRequestRecords.map((r) => ({
            id: r.id,
            status: r.status,
            iterations: r.iterations,
            totalInputTokens: r.totalInputTokens,
            totalOutputTokens: r.totalOutputTokens,
            totalCachedTokens: r.totalCachedTokens,
            totalTokens: r.totalTokens,
            totalToolCalls: r.totalToolCalls,
            totalCost: r.totalCost,
            totalDurationMs: r.totalDurationMs,
            apiDurationMs: r.apiDurationMs,
            toolDurationMs: r.toolDurationMs,
            createdAt: r.createdAt,
            completedAt: r.completedAt,
          })),
        }),
      );
    }

    // ── 7. Focus (if a surface was given AND we weren't superseded) ──────────
    // If the calling surface navigated away mid-load (signal aborted), skip the
    // focus write. Otherwise this late-resolving load reverts the surface back
    // to this conversation after the user already moved on — the "click + and
    // it snaps back to the old chat" bug.
    if (surfaceKey && !signal?.aborted) {
      dispatch(setFocus({ surfaceKey, conversationId }));
    }

    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] DONE cid=%s — all 7 dimensions hydrated",
    //   conversationId,
    // );
    return { conversationId };
  },
);
