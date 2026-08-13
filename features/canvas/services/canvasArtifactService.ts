/**
 * Canvas Artifact Service
 *
 * Wraps the cx_canvas_* RPC functions for artifact persistence.
 * Called after streaming completes to persist artifact blocks to canvas_items.
 *
 * This is SEPARATE from canvasItemsService.ts which handles manual save/update/delete.
 * This service specifically handles model-produced artifact blocks that come from
 * <artifact> tags in streaming responses.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import type { ArtifactSourceRef } from "@/features/canvas/artifact-types/persistence/artifact-adapters";

// ---------------------------------------------------------------------------
// canvasType → cx_artifact artifact_type enum map
//
// Only canvasTypes that map to a known artifact_type enum value are listed.
// Unmapped types (no matching enum) are SKIPPED — the discovery-index write
// is omitted for them. When the DB enum gains new values, extend this map.
// ---------------------------------------------------------------------------

type ArtifactTypeEnum = Database["public"]["Enums"]["artifact_type"];

const CANVAS_TYPE_TO_ARTIFACT_TYPE: Partial<Record<string, ArtifactTypeEnum>> =
  {
    comparison: "comparison_table",
    flashcards: "flashcard_deck",
    timeline: "timeline",
    diagram: "diagram",
    quiz: "quiz",
    presentation: "presentation",
    code: "code_snippet",
    react: "code_snippet",
    html: "html_page",
    iframe: "html_page",
    // markdown-payload types — use "other" (valid enum value)
    mermaid: "diagram",
    svg: "diagram",
    chart: "data_table",
    table: "data_table",
    questionnaire: "other",
    transcript: "other",
    structured_info: "other",
    tree: "other",
    research: "report",
    resources: "other",
    progress: "other",
    troubleshooting: "other",
    recipe: "other",
    "decision-tree": "other",
    math_problem: "other",
    image: "other",
  };

/**
 * Resolve a canvasType to its cx_artifact artifact_type enum value.
 * Returns null for types not yet in the enum — callers must skip the write.
 */
export function canvasTypeToArtifactType(
  canvasType: string,
): ArtifactTypeEnum | null {
  return CANVAS_TYPE_TO_ARTIFACT_TYPE[canvasType] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtifactUpsertInput {
  messageId: string;
  artifactIndex: number;
  type: string;
  title: string;
  content: string;
  /**
   * Structured (kind-IR) value — persisted as content.data (an object)
   * instead of the string, so reloads render with zero reprocessing.
   */
  structured?: Record<string, unknown> | null;
  /** Type-specific metadata persisted as content.metadata (e.g. mermaid diagramType/theme). */
  metadata?: Record<string, unknown>;
  sourceType?: "model_direct" | "model_converted" | "user_created" | "forked";
}

/** Any-surface upsert input — the source ref replaces messageId. */
export interface SourceArtifactUpsertInput {
  source: ArtifactSourceRef;
  artifactIndex: number;
  type: string;
  title: string;
  content: string;
  structured?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  conversationId?: string | null;
  sourceType?: "model_direct" | "model_converted" | "user_created" | "forked";
}

export interface ArtifactVersionInput {
  originalCanvasId: string;
  newMessageId: string;
  artifactIndex: number;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CanvasArtifactRow {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  content: any;
  conversation_id: string | null;
  source_message_id: string | null;
  artifact_index: number | null;
  version: number;
  parent_canvas_id: string | null;
  source_type: string;
  /** Domain-record link (R6/R7): e.g. "udt_datasets", "ctx_tasks", "code_files". */
  external_system: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const canvasArtifactService = {
  /**
   * Upsert an artifact from model output.
   * INSERT on first call. If same (message_id, artifact_index) exists, UPDATE in place.
   */
  async upsert(input: ArtifactUpsertInput): Promise<CanvasArtifactRow | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase.rpc("cx_canvas_upsert", {
        p_user_id: userId,
        p_message_id: input.messageId,
        p_artifact_index: input.artifactIndex,
        p_type: input.type,
        p_title: input.title,
        p_content: {
          // Structured (kind-IR) artifacts persist the value OBJECT —
          // self-describing via __kind; readers keep the same
          // {data, type, metadata} envelope either way.
          data: input.structured ?? input.content,
          type: input.type,
          metadata: input.metadata ?? {},
        },
        // A persisted message is the authoritative conversation binding.
        // This matters for Builder manual runs: Redux deliberately keeps one
        // local conversation id while /ai/manual mints a new durable
        // conversation per request. Omitting the optional argument makes the
        // RPC resolve chat.message.conversation_id instead of trusting UI
        // state that may intentionally refer to a different conversation.
        p_source_type: input.sourceType ?? "model_direct",
      });

      if (error) {
        console.error("[canvasArtifactService.upsert] RPC error:", error);
        return null;
      }

      return data as CanvasArtifactRow;
    } catch (err) {
      console.error("[canvasArtifactService.upsert] Error:", err);
      return null;
    }
  },

  /**
   * Any-surface upsert (Track 2A). Chat sources delegate to `upsert` (the
   * exact same cx_canvas_upsert RPC — provably unchanged path); every other
   * source system goes through cx_canvas_upsert_source, idempotent on the
   * (source_system, source_id, artifact_index) natural key.
   */
  async upsertForSource(
    input: SourceArtifactUpsertInput,
  ): Promise<CanvasArtifactRow | null> {
    if (input.source.system === "cx_message") {
      return this.upsert({
        messageId: input.source.id,
        artifactIndex: input.artifactIndex,
        type: input.type,
        title: input.title,
        content: input.content,
        structured: input.structured,
        metadata: input.metadata,
        sourceType: input.sourceType,
      });
    }
    try {
      const userId = requireUserId();
      const { data, error } = await supabase.rpc("cx_canvas_upsert_source", {
        p_user_id: userId,
        p_source_system: input.source.system,
        p_source_id: input.source.id,
        p_artifact_index: input.artifactIndex,
        p_type: input.type,
        p_title: input.title,
        p_content: {
          data: input.structured ?? input.content,
          type: input.type,
          metadata: input.metadata ?? {},
        },
        p_conversation_id: input.conversationId ?? undefined,
        p_source_type: input.sourceType ?? "model_direct",
      });

      if (error) {
        console.error(
          "[canvasArtifactService.upsertForSource] RPC error:",
          error,
        );
        return null;
      }

      return data as CanvasArtifactRow;
    } catch (err) {
      console.error("[canvasArtifactService.upsertForSource] Error:", err);
      return null;
    }
  },

  /**
   * Create a new version of an existing artifact.
   * Used when the model updates an artifact in a subsequent message.
   */
  async createVersion(
    input: ArtifactVersionInput,
  ): Promise<CanvasArtifactRow | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase.rpc("cx_canvas_update_version", {
        p_user_id: userId,
        p_original_canvas_id: input.originalCanvasId,
        p_new_message_id: input.newMessageId,
        p_artifact_index: input.artifactIndex,
        p_type: input.type,
        p_title: input.title,
        p_content: {
          data: input.content,
          type: input.type,
          metadata: input.metadata ?? {},
        },
      });

      if (error) {
        console.error(
          "[canvasArtifactService.createVersion] RPC error:",
          error,
        );
        return null;
      }

      return data as CanvasArtifactRow;
    } catch (err) {
      console.error("[canvasArtifactService.createVersion] Error:", err);
      return null;
    }
  },

  /**
   * Get all artifacts materialized from an arbitrary source record, ordered
   * by artifact_index. Chat sources keep the RPC path (getByMessage); other
   * systems read the RLS-filtered table directly on the source natural key.
   */
  async getBySource(source: ArtifactSourceRef): Promise<CanvasArtifactRow[]> {
    if (source.system === "cx_message") {
      return this.getByMessage(source.id);
    }
    try {
      const { data, error } = await supabase
        .schema("canvas")
        .from("canvas_items")
        .select("*")
        .eq("source_system", source.system)
        .eq("source_id", source.id)
        .is("deleted_at", null)
        .order("artifact_index", { ascending: true });

      if (error) {
        console.error("[canvasArtifactService.getBySource] error:", error);
        return [];
      }
      return (data ?? []) as CanvasArtifactRow[];
    } catch (err) {
      console.error("[canvasArtifactService.getBySource] Error:", err);
      return [];
    }
  },

  /**
   * Get all artifacts linked to a specific message, ordered by artifact_index.
   */
  async getByMessage(messageId: string): Promise<CanvasArtifactRow[]> {
    try {
      const { data, error } = await supabase.rpc("cx_canvas_get_by_message", {
        p_message_id: messageId,
      });

      if (error) {
        console.error("[canvasArtifactService.getByMessage] RPC error:", error);
        return [];
      }

      return (data ?? []) as CanvasArtifactRow[];
    } catch (err) {
      console.error("[canvasArtifactService.getByMessage] Error:", err);
      return [];
    }
  },

  /**
   * Get the latest version of each artifact in a conversation.
   * Used for the conversation canvas sidebar panel.
   */
  async getConversationLatest(
    conversationId: string,
  ): Promise<CanvasArtifactRow[]> {
    try {
      const { data, error } = await supabase.rpc(
        "cx_canvas_get_conversation_latest",
        {
          p_conversation_id: conversationId,
        },
      );

      if (error) {
        console.error(
          "[canvasArtifactService.getConversationLatest] RPC error:",
          error,
        );
        return [];
      }

      return (data ?? []) as CanvasArtifactRow[];
    } catch (err) {
      console.error(
        "[canvasArtifactService.getConversationLatest] Error:",
        err,
      );
      return [];
    }
  },

  /**
   * Link a materialized artifact to its custom-system domain record
   * (external_system/external_id). Owner-only via RLS; failures are logged,
   * not thrown (the artifact itself already persisted).
   */
  async setExternalLink(
    canvasId: string,
    link: { externalSystem?: string; externalId?: string },
  ): Promise<void> {
    try {
      const { error } = await supabase
        .schema("canvas")
        .from("canvas_items")
        .update({
          external_system: link.externalSystem ?? null,
          external_id: link.externalId ?? null,
        })
        .eq("id", canvasId);
      if (error) {
        console.error("[canvasArtifactService.setExternalLink] error:", error);
      }
    } catch (err) {
      console.error("[canvasArtifactService.setExternalLink] error:", err);
    }
  },

  /**
   * Get a single canvas item by id. RLS scopes this to the owner, public
   * items, or items the caller has explicit permission on — so it safely
   * resolves a materialized `<artifact id>` both for the author and shared views.
   * Returns null when not found / not accessible.
   */
  async getById(canvasId: string): Promise<CanvasArtifactRow | null> {
    try {
      const { data, error } = await supabase
        .schema("canvas")
        .from("canvas_items")
        .select("*")
        .is("deleted_at", null)
        .eq("id", canvasId)
        .maybeSingle();

      if (error) {
        console.error("[canvasArtifactService.getById] error:", error);
        return null;
      }

      return (data as CanvasArtifactRow | null) ?? null;
    } catch (err) {
      console.error("[canvasArtifactService.getById] Error:", err);
      return null;
    }
  },

  /**
   * Save a USER edit as a new version in the artifact's chain.
   *
   * This is the canonical user-edit path (the model-update path is
   * createVersion, which requires the new message id). The RPC resolves the
   * chain root, takes MAX(version)+1 atomically, and inserts with
   * source_type='user_created', source_message_id NULL, artifact_index NULL
   * (respects the (source_message_id, artifact_index) partial unique).
   *
   * `content` accepts a STRING (text-payload types: mermaid, code) or a
   * STRUCTURED value object (kind-IR types: a NEW zero-loss `content.data`
   * object self-describing via `__kind` — never mutate the prior version's
   * object in place). Both persist under the same `{data, type, metadata}`
   * envelope; `ArtifactRefBlock` rehydrates objects via
   * `kindServerDataFromStoredValue` with no re-parse.
   */
  async saveUserVersion(input: {
    canvasId: string;
    title?: string | null;
    content: string | Record<string, unknown>;
    type: string;
    metadata?: Record<string, unknown>;
  }): Promise<CanvasArtifactRow | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase.rpc(
        "cx_canvas_save_user_version",
        {
          p_user_id: userId,
          p_canvas_id: input.canvasId,
          p_title: input.title ?? "",
          p_content: {
            data: input.content,
            type: input.type,
            metadata: input.metadata ?? {},
          },
        },
      );

      if (error) {
        console.error(
          "[canvasArtifactService.saveUserVersion] RPC error:",
          error,
        );
        return null;
      }
      return data as CanvasArtifactRow;
    } catch (err) {
      console.error("[canvasArtifactService.saveUserVersion] Error:", err);
      return null;
    }
  },

  /**
   * Create a brand-new user-authored artifact (no source message).
   */
  async createManual(input: {
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
    conversationId?: string | null;
  }): Promise<CanvasArtifactRow | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase.rpc("cx_canvas_create_manual", {
        p_user_id: userId,
        p_type: input.type,
        p_title: input.title,
        p_content: {
          data: input.content,
          type: input.type,
          metadata: input.metadata ?? {},
        },
        p_conversation_id: input.conversationId ?? undefined,
      });

      if (error) {
        console.error("[canvasArtifactService.createManual] RPC error:", error);
        return null;
      }
      return data as CanvasArtifactRow;
    } catch (err) {
      console.error("[canvasArtifactService.createManual] Error:", err);
      return null;
    }
  },

  /**
   * Upsert a cx_artifact discovery-index row that points back to a
   * materialized canvas_items row — from chat OR any other source surface.
   *
   * Idempotent on canvas_item_id: if a cx_artifact row already references this
   * canvas item, it is returned unchanged.  Only types with a known
   * artifact_type enum value are indexed — callers should pre-filter with
   * canvasTypeToArtifactType(), but this method also guards internally.
   *
   * Identity contract (post any-surface migration):
   *   source_system/source_id/artifact_index — natural key (mirrors
   *   canvas_items); message_id/conversation_id — chat rows only (both
   *   nullable); non-chat rows insert with both null and org resolved via
   *   ensureOrgId (RLS owner-fallback covers NULL-conversation rows).
   *
   * NON-BLOCKING: returns null on any error (never throws).
   */
  async upsertDiscoveryIndex(input: {
    canvasId: string;
    canvasType: string;
    title: string | null;
    source: ArtifactSourceRef;
    /** Stable 1-based index within the source (= canvas_items.artifact_index). */
    artifactIndex: number;
    /** Chat conversation — required context for chat rows, absent otherwise. */
    conversationId?: string | null;
  }): Promise<{ id: string } | null> {
    const artifactType = canvasTypeToArtifactType(input.canvasType);
    if (!artifactType) {
      // canvasType has no matching enum value — skip silently.
      return null;
    }
    try {
      const userId = requireUserId();
      const isChat = input.source.system === "cx_message";

      // Check for an existing row tied to this canvas_item_id first.
      const { data: existing, error: lookupErr } = await supabase
        .schema("chat")
        .from("artifact")
        .select("id")
        .eq("canvas_item_id", input.canvasId)
        .maybeSingle();

      if (lookupErr) {
        console.error(
          "[canvasArtifactService.upsertDiscoveryIndex] lookup error:",
          lookupErr,
        );
        return null;
      }
      if (existing) return { id: existing.id };

      // Scope columns: chat rows inherit org/task from the conversation;
      // non-chat rows fall back to the active/personal org. A feature table
      // may not depend on a project FK — project membership, when it exists,
      // is a `platform.associations` edge on the conversation.
      let organizationId: string | null = null;
      let taskId: string | null = null;
      if (isChat) {
        // A chat row needs its conversation for scope columns; some
        // legitimate callers (on-demand ensure without conversation
        // context) don't have one — skip quietly, reconcile fills it.
        if (!input.conversationId) return null;
        const { data: conversation, error: conversationErr } = await supabase
          .schema("chat")
          .from("conversation")
          .select("organization_id, task_id")
          .is("deleted_at", null)
          .eq("id", input.conversationId)
          .maybeSingle();

        if (conversationErr || !conversation) {
          console.error(
            "[canvasArtifactService.upsertDiscoveryIndex] conversation lookup error:",
            conversationErr ?? "conversation not found",
          );
          return null;
        }
        organizationId = conversation.organization_id;
        taskId = conversation.task_id;
      } else {
        organizationId = await ensureOrgId(undefined);
      }

      const normalizedExternalSystem: string | null = null;
      // `user_id` is the LAST legacy write left in this repo: it is the lead
      // column of `uq_cx_artifact_source_natural_key`, the dedup index this
      // upsert infers. Stopping the write before that index is rebuilt on
      // `created_by` would make every existing row invisible to ON CONFLICT
      // and reintroduce duplicate artifacts. Delete this line (and switch
      // `onConflict` below) in the same change that lands the new index.
      // Ownership itself is already canonical — `_stamp_actor` fills
      // `created_by`, and the natural-key read below keys on it.
      const insertRow = {
        canvas_item_id: input.canvasId,
        message_id: isChat ? input.source.id : null,
        conversation_id: isChat ? (input.conversationId ?? null) : null,
        source_system: input.source.system,
        source_id: input.source.id,
        artifact_index: input.artifactIndex,
        user_id: userId,
        artifact_type: artifactType,
        status: "published" as const,
        title: input.title ?? null,
        organization_id: organizationId,
        task_id: taskId,
        external_system: normalizedExternalSystem,
        external_id: null,
        external_url: null,
        description: null,
        thumbnail_url: null,
        metadata: {},
      };

      // Atomic get-or-create on the discovery natural key (mirrors
      // app/api/artifacts/route.ts). ON CONFLICT DO NOTHING never 409s.
      const { data: created, error: upsertErr } = await supabase
        .schema("chat")
        .from("artifact")
        .upsert(insertRow, {
          onConflict:
            "user_id,source_system,source_id,artifact_index,artifact_type,external_system",
          ignoreDuplicates: true,
        })
        .select("id")
        .maybeSingle();

      if (upsertErr) {
        console.error(
          "[canvasArtifactService.upsertDiscoveryIndex] upsert error:",
          upsertErr,
        );
        return null;
      }
      if (created) return { id: created.id };

      // Natural key already existed (concurrent materialize / reconcile).
      let existingByKey = supabase
        .schema("chat")
        .from("artifact")
        .select("id, canvas_item_id")
        .eq("created_by", userId)
        .eq("source_system", input.source.system)
        .eq("source_id", input.source.id)
        .eq("artifact_index", input.artifactIndex)
        .eq("artifact_type", artifactType);
      existingByKey = normalizedExternalSystem
        ? existingByKey.eq("external_system", normalizedExternalSystem)
        : existingByKey.is("external_system", null);

      const { data: keyed, error: keyedErr } =
        await existingByKey.maybeSingle();
      if (keyedErr) {
        console.error(
          "[canvasArtifactService.upsertDiscoveryIndex] natural-key lookup error:",
          keyedErr,
        );
        return null;
      }
      if (!keyed) return null;

      // Backfill canvas_item_id when the row predates materialization or a
      // prior race left the link null. Never repoint an existing link.
      if (!keyed.canvas_item_id) {
        const { error: linkErr } = await supabase
          .schema("chat")
          .from("artifact")
          .update({ canvas_item_id: input.canvasId })
          .eq("id", keyed.id);
        if (linkErr) {
          console.error(
            "[canvasArtifactService.upsertDiscoveryIndex] canvas link error:",
            linkErr,
          );
        }
      }

      return { id: keyed.id };
    } catch (err) {
      console.error("[canvasArtifactService.upsertDiscoveryIndex] error:", err);
      return null;
    }
  },

  /**
   * Get all versions of an artifact given any version's ID.
   */
  async getVersionHistory(canvasId: string): Promise<CanvasArtifactRow[]> {
    try {
      const { data, error } = await supabase.rpc(
        "cx_canvas_get_version_history",
        {
          p_canvas_id: canvasId,
        },
      );

      if (error) {
        console.error(
          "[canvasArtifactService.getVersionHistory] RPC error:",
          error,
        );
        return [];
      }

      return (data ?? []) as CanvasArtifactRow[];
    } catch (err) {
      console.error("[canvasArtifactService.getVersionHistory] Error:", err);
      return [];
    }
  },
};
