/**
 * attachBlockAsEditableContext — user-initiated "pin this code/json block as
 * editable conversation context."
 *
 * Flow (Arman's v1):
 *   1. Materialize the fence into a `canvas_items` row (type=code) if needed
 *   2. Rewrite the message to the R1 `<artifact type id version>body</artifact>`
 *      form via `cx_message_set_content` (version history starts here)
 *   3. Flip the in-session message off the live stream source so the UI
 *      renders by id (ArtifactRefBlock + ArtifactVersionHistory)
 *   4. Publish the canvas UUID as an `instanceContext` key with
 *      `mutable:true` / `persist:auto` / `source.kind=canvas_item` so the
 *      agent can ctx_patch it and the writeback saves a new version
 *
 * Idempotent: re-attaching the same body reuses the existing canvas row and
 * refreshes the context entry.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { CxContentBlock, CxTextContent } from "@/features/public-chat/types/cx-tables";
import { reconstructBlockMarkdown } from "@/features/agents/redux/execution-system/utils/assemble-cx-content-blocks";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { updateMessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { refetchSingleMessage } from "@/features/agents/redux/execution-system/message-crud/refetch-single-message.thunk";
import { buildCanvasItemContextValue } from "@/features/agents/utils/canvasItemContext";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import {
  CANVAS_ITEM_UPDATED_EVENT,
  invalidateCanvasItemCache,
} from "@/features/canvas/hooks/useCanvasItem";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { wrapArtifactText } from "./artifactWire";
import { ensureArtifactPersisted } from "./ensureArtifactPersisted";
import { isRealSourceId } from "./materializeBlocks";
import { cxMessageContentRewriter } from "./materializeMessageArtifacts";

export interface AttachBlockInput {
  conversationId: string;
  messageId: string;
  /** Fence body (no backticks). */
  content: string;
  /** Fence language — json/jsonc/json5 still materialize as canvas type `code`. */
  language: string;
  title?: string;
  /**
   * When the block is already an `<artifact id=UUID>`, pass it to skip the
   * upsert and only (re)publish context.
   */
  existingArtifactId?: string | null;
}

export interface AttachBlockResult {
  ok: boolean;
  artifactId: string | null;
  version: number | null;
  wasCreated: boolean;
  alreadyAttached: boolean;
  errors: string[];
  steps: string[];
}

function isTextBlock(b: CxContentBlock): b is CxTextContent {
  return (b as { type?: string }).type === "text";
}

function defaultTitle(language: string): string {
  const lang = language.trim() || "text";
  if (lang === "json" || lang === "jsonc" || lang === "json5") {
    return "JSON artifact";
  }
  return `${lang.charAt(0).toUpperCase()}${lang.slice(1)} code`;
}

/** Build the markdown fence we expect to find in the message text. */
function fenceMarkdown(language: string, body: string): string {
  return reconstructBlockMarkdown({
    type: "code",
    content: body,
    data: { language: language || "text" },
  });
}

/**
 * Replace the FIRST matching fence in the message content with the R1
 * artifact tag. Returns null when the fence isn't found (caller should abort
 * the rewrite — never leave a dangling ref).
 */
function rewriteFenceToArtifact(
  content: CxContentBlock[],
  language: string,
  body: string,
  wire: string,
): CxContentBlock[] | null {
  const fence = fenceMarkdown(language, body);
  let replaced = false;
  const out: CxContentBlock[] = content.map((block) => {
    if (replaced || !isTextBlock(block)) return block;
    const text = block.text ?? "";
    const idx = text.indexOf(fence);
    if (idx === -1) {
      // Soft match: fence body alone between fences of this language.
      const soft = new RegExp(
        "```" +
          escapeRegExp(language || "") +
          "\\s*\\n" +
          escapeRegExp(body) +
          "\\n```",
      );
      if (!soft.test(text)) return block;
      replaced = true;
      return {
        ...block,
        text: text.replace(soft, wire),
      } as CxTextContent;
    }
    replaced = true;
    return {
      ...block,
      text: text.slice(0, idx) + wire + text.slice(idx + fence.length),
    } as CxTextContent;
  });
  return replaced ? out : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * If the message already carries an R1 tag whose body equals `body`, return
 * that artifact id so we don't double-materialize.
 */
function findExistingArtifactIdForBody(
  content: CxContentBlock[],
  body: string,
): string | null {
  const re =
    /<artifact\b[^>]*\bid=["']([0-9a-f-]{36})["'][^>]*>\s*([\s\S]*?)\s*<\/artifact>/gi;
  for (const block of content) {
    if (!isTextBlock(block)) continue;
    const text = block.text ?? "";
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if ((m[2] ?? "").trim() === body.trim() && isMaterializedArtifactId(m[1])) {
        return m[1]!;
      }
    }
  }
  return null;
}

async function nextArtifactIndex(messageId: string): Promise<number> {
  const existing = await canvasArtifactService.getBySource({
    system: "cx_message",
    id: messageId,
  });
  if (!existing.length) return 1;
  const max = existing.reduce(
    (acc, row) => Math.max(acc, row.artifact_index ?? 0),
    0,
  );
  return max + 1;
}

function extractBody(row: {
  content: unknown;
}): string {
  const stored = row.content as
    | { data?: unknown }
    | string
    | null
    | undefined;
  if (stored && typeof stored === "object" && "data" in stored) {
    return typeof stored.data === "string"
      ? stored.data
      : JSON.stringify(stored.data ?? "");
  }
  if (typeof stored === "string") return stored;
  return "";
}

/**
 * The thunk-friendly entry. Call from a React hook with store.dispatch /
 * store.getState, or from another thunk.
 */
export async function attachBlockAsEditableContext(
  input: AttachBlockInput,
  deps: { dispatch: AppDispatch; getState: () => RootState },
): Promise<AttachBlockResult> {
  const steps: string[] = [];
  const errors: string[] = [];
  const { conversationId, messageId, content, language } = input;
  const title = input.title?.trim() || defaultTitle(language);
  const body = content;

  if (!isRealSourceId(messageId)) {
    errors.push(
      "Message is not yet persisted — wait for the turn to finish, then attach.",
    );
    return {
      ok: false,
      artifactId: null,
      version: null,
      wasCreated: false,
      alreadyAttached: false,
      errors,
      steps,
    };
  }

  const state = deps.getState();
  const record =
    state.messages?.byConversationId?.[conversationId]?.byId?.[messageId];
  const messageContent = (record?.content ?? null) as CxContentBlock[] | null;
  if (!messageContent || !Array.isArray(messageContent)) {
    errors.push("Could not read message content from the store");
    return {
      ok: false,
      artifactId: null,
      version: null,
      wasCreated: false,
      alreadyAttached: false,
      errors,
      steps,
    };
  }

  // ── 1. Resolve / create the canvas row ──────────────────────────────────
  // Prefer the message's R1 id (stable context key) over a resolve:latest
  // chrome id that may be a newer version row in the same chain.
  const bodyMatchId = findExistingArtifactIdForBody(messageContent, body);
  let artifactId =
    bodyMatchId ??
    (isMaterializedArtifactId(input.existingArtifactId)
      ? input.existingArtifactId
      : null);

  let version = 1;
  let wasCreated = false;
  let rowContent = body;

  if (artifactId) {
    steps.push(`reusing existing artifact ${artifactId}`);
    const row = await canvasArtifactService.getById(artifactId);
    if (row) {
      version = row.version;
      rowContent = extractBody(row) || body;
    } else {
      // Stale id — fall back to upsert below.
      steps.push("existing id not found in DB — will upsert");
      artifactId = null;
    }
  }

  const needsRewrite =
    !artifactId ||
    !(
      findExistingArtifactIdForBody(messageContent, body) === artifactId ||
      messageContent.some(
        (b) =>
          isTextBlock(b) &&
          typeof b.text === "string" &&
          b.text.includes(`id="${artifactId}"`),
      )
    );

  if (needsRewrite) {
    // Dry-run the fence locate with a placeholder wire so we fail BEFORE upsert.
    const probe = rewriteFenceToArtifact(
      messageContent,
      language || "text",
      body,
      "<!--probe-->",
    );
    if (!probe) {
      errors.push(
        "Could not locate this code fence in the message — try again after the response finishes, or copy the block first",
      );
      return {
        ok: false,
        artifactId: null,
        version: null,
        wasCreated: false,
        alreadyAttached: false,
        errors,
        steps,
      };
    }
  }

  if (!artifactId) {
    const artifactIndex = await nextArtifactIndex(messageId);
    steps.push(`ensureArtifactPersisted index=${artifactIndex} type=code`);
    const ensured = await ensureArtifactPersisted({
      canvasType: "code",
      title,
      content: body,
      messageId,
      conversationId,
      artifactIndex,
      metadata: { language: language || "text" },
    });
    if (!ensured.ok || !ensured.artifactId) {
      errors.push(...ensured.errors);
      errors.push("Failed to persist canvas_items row");
      return {
        ok: false,
        artifactId: null,
        version: null,
        wasCreated: false,
        alreadyAttached: false,
        errors,
        steps: [...steps, ...ensured.steps],
      };
    }
    artifactId = ensured.artifactId;
    version = ensured.version ?? 1;
    wasCreated = ensured.wasCreated;
    if (ensured.row) rowContent = extractBody(ensured.row) || body;
    steps.push(...ensured.steps);
  }

  // ── 2. Rewrite message to R1 (skip if already rewritten for this id) ────
  const alreadyWired =
    findExistingArtifactIdForBody(messageContent, body) === artifactId ||
    messageContent.some(
      (b) =>
        isTextBlock(b) &&
        typeof b.text === "string" &&
        b.text.includes(`id="${artifactId}"`),
    );

  if (!alreadyWired) {
    const wire = wrapArtifactText({
      canvasType: "code",
      id: artifactId,
      version,
      title,
      body,
    });
    const rewritten = rewriteFenceToArtifact(
      messageContent,
      language || "text",
      body,
      wire,
    );
    if (!rewritten) {
      // Should be unreachable after the pre-flight probe — still abort loudly.
      errors.push(
        "Could not locate the code fence in the message to rewrite — aborting so we never leave a dangling ref",
      );
      return {
        ok: false,
        artifactId,
        version,
        wasCreated,
        alreadyAttached: false,
        errors,
        steps,
      };
    }
    steps.push("rewriting message via cx_message_set_content");
    const rewrite = await cxMessageContentRewriter(messageId)(rewritten);
    if (!rewrite.ok) {
      errors.push(rewrite.error ?? "cx_message_set_content failed");
      return {
        ok: false,
        artifactId,
        version,
        wasCreated,
        alreadyAttached: false,
        errors,
        steps,
      };
    }
  } else {
    steps.push("message already carries R1 tag for this artifact");
  }

  // ── 3. Flip in-session render to by-id (version history visible) ────────
  // Clear _streamRequestId on EVERY message that shares this request — a
  // multi-iteration agentic turn collapses by requestId, and clearing only
  // one row would duplicate the answer.
  steps.push("refetchSingleMessage + clear _streamRequestId cohort");
  await deps.dispatch(refetchSingleMessage({ conversationId, messageId }));
  const afterState = deps.getState();
  const entry =
    afterState.messages.byConversationId[conversationId];
  const streamReqId = entry?.byId?.[messageId]?._streamRequestId;
  if (streamReqId && entry) {
    for (const mid of entry.orderedIds) {
      const rec = entry.byId[mid];
      if (rec?._streamRequestId === streamReqId) {
        deps.dispatch(
          updateMessageRecord({
            conversationId,
            messageId: mid,
            patch: { _streamRequestId: undefined },
          }),
        );
      }
    }
  } else {
    deps.dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: { _streamRequestId: undefined },
      }),
    );
  }
  invalidateCanvasItemCache(artifactId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CANVAS_ITEM_UPDATED_EVENT, {
        detail: { rootId: artifactId, latestId: artifactId },
      }),
    );
  }

  // ── 4. Publish as editable context (key = canvas UUID) ──────────────────
  const contextValue = buildCanvasItemContextValue({
    artifactId,
    content: rowContent,
    label: title,
    version,
  });
  const existingEntry =
    state.instanceContext?.byConversationId?.[conversationId]?.[artifactId];
  const alreadyAttached = Boolean(existingEntry);
  deps.dispatch(
    setContextEntry({
      conversationId,
      key: artifactId,
      value: contextValue,
      type: "text",
      label: title,
    }),
  );
  steps.push(
    alreadyAttached
      ? `refreshed context entry ${artifactId}`
      : `published context entry ${artifactId}`,
  );

  return {
    ok: true,
    artifactId,
    version,
    wasCreated,
    alreadyAttached,
    errors,
    steps,
  };
}
