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
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// canvasType → cx_artifact artifact_type enum map
//
// Only canvasTypes that map to a known artifact_type enum value are listed.
// Unmapped types (no matching enum) are SKIPPED — the discovery-index write
// is omitted for them. When the DB enum gains new values, extend this map.
// ---------------------------------------------------------------------------

type ArtifactTypeEnum = Database["public"]["Enums"]["artifact_type"];

const CANVAS_TYPE_TO_ARTIFACT_TYPE: Partial<Record<string, ArtifactTypeEnum>> = {
    comparison: "comparison_table",
    flashcards: "flashcard_deck",
    timeline: "timeline",
    diagram: "diagram",
    quiz: "quiz",
    presentation: "presentation",
    code: "code_snippet",
    html: "html_page",
    iframe: "html_page",
    // markdown-payload types — use "other" (valid enum value)
    mermaid: "diagram",
    svg: "diagram",
    chart: "data_table",
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
export function canvasTypeToArtifactType(canvasType: string): ArtifactTypeEnum | null {
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
    /** Type-specific metadata persisted as content.metadata (e.g. mermaid diagramType/theme). */
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
    source_message_id: string | null;
    artifact_index: number | null;
    version: number;
    parent_canvas_id: string | null;
    source_type: string;
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
                    data: input.content,
                    type: input.type,
                    metadata: input.metadata ?? {},
                },
                p_conversation_id: input.conversationId ?? null,
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
     * Create a new version of an existing artifact.
     * Used when the model updates an artifact in a subsequent message.
     */
    async createVersion(input: ArtifactVersionInput): Promise<CanvasArtifactRow | null> {
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
                console.error("[canvasArtifactService.createVersion] RPC error:", error);
                return null;
            }

            return data as CanvasArtifactRow;
        } catch (err) {
            console.error("[canvasArtifactService.createVersion] Error:", err);
            return null;
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
    async getConversationLatest(conversationId: string): Promise<CanvasArtifactRow[]> {
        try {
            const { data, error } = await supabase.rpc("cx_canvas_get_conversation_latest", {
                p_conversation_id: conversationId,
            });

            if (error) {
                console.error("[canvasArtifactService.getConversationLatest] RPC error:", error);
                return [];
            }

            return (data ?? []) as CanvasArtifactRow[];
        } catch (err) {
            console.error("[canvasArtifactService.getConversationLatest] Error:", err);
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
                .from("canvas_items")
                .select("*")
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
     */
    async saveUserVersion(input: {
        canvasId: string;
        title?: string | null;
        content: string;
        type: string;
        metadata?: Record<string, unknown>;
    }): Promise<CanvasArtifactRow | null> {
        try {
            const userId = requireUserId();
            const { data, error } = await supabase.rpc("cx_canvas_save_user_version", {
                p_user_id: userId,
                p_canvas_id: input.canvasId,
                p_title: input.title ?? null,
                p_content: {
                    data: input.content,
                    type: input.type,
                    metadata: input.metadata ?? {},
                },
            });

            if (error) {
                console.error("[canvasArtifactService.saveUserVersion] RPC error:", error);
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
                p_conversation_id: input.conversationId ?? null,
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
     * Upsert a cx_artifact discovery-index row that points back to a canvas_items
     * row materialised from chat.
     *
     * Idempotent on canvas_item_id: if a cx_artifact row already references this
     * canvas item, it is returned unchanged.  Only types with a known
     * artifact_type enum value are indexed — callers should pre-filter with
     * canvasTypeToArtifactType(), but this method also guards internally.
     *
     * NOT-NULL contract (from the DB schema):
     *   conversation_id, message_id, user_id, artifact_type, status — all required.
     *   org/project/task — all nullable, set null when not available.
     *   canvas_item_id — nullable column in DB, set to canvasId here.
     *
     * NON-BLOCKING: returns null on any error (never throws).
     */
    async upsertDiscoveryIndex(input: {
        canvasId: string;
        canvasType: string;
        title: string | null;
        messageId: string;
        conversationId: string;
    }): Promise<{ id: string } | null> {
        const artifactType = canvasTypeToArtifactType(input.canvasType);
        if (!artifactType) {
            // canvasType has no matching enum value — skip silently.
            return null;
        }
        try {
            const userId = requireUserId();

            // Check for an existing row tied to this canvas_item_id first.
            const { data: existing, error: lookupErr } = await supabase
                .from("cx_artifact")
                .select("id")
                .eq("canvas_item_id", input.canvasId)
                .maybeSingle();

            if (lookupErr) {
                console.error("[canvasArtifactService.upsertDiscoveryIndex] lookup error:", lookupErr);
                return null;
            }
            if (existing) return { id: existing.id };

            // Insert a new discovery-index row.
            const { data, error } = await supabase
                .from("cx_artifact")
                .insert({
                    canvas_item_id: input.canvasId,
                    message_id: input.messageId,
                    conversation_id: input.conversationId,
                    user_id: userId,
                    artifact_type: artifactType,
                    status: "published",
                    title: input.title ?? null,
                    organization_id: null,
                    project_id: null,
                    task_id: null,
                    external_system: null,
                    external_id: null,
                    external_url: null,
                    description: null,
                    thumbnail_url: null,
                    metadata: {},
                })
                .select("id")
                .single();

            if (error) {
                console.error("[canvasArtifactService.upsertDiscoveryIndex] insert error:", error);
                return null;
            }

            return data ? { id: data.id } : null;
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
            const { data, error } = await supabase.rpc("cx_canvas_get_version_history", {
                p_canvas_id: canvasId,
            });

            if (error) {
                console.error("[canvasArtifactService.getVersionHistory] RPC error:", error);
                return [];
            }

            return (data ?? []) as CanvasArtifactRow[];
        } catch (err) {
            console.error("[canvasArtifactService.getVersionHistory] Error:", err);
            return [];
        }
    },
};
