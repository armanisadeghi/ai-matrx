/**
 * Artifacts API Route
 *
 * CRUD operations for the cx_artifact table in the MAIN Supabase project.
 * Uses server-side auth — the calling user must be authenticated.
 *
 * POST body: { action, ...params }
 *   action: 'create' | 'update' | 'archive' | 'delete' | 'get' | 'list' | 'listForMessage'
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { TablesUpdate } from "@/types/database.types";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      // ── create ───────────────────────────────────────────────────────
      // Idempotent on the natural key
      //   (owner, message_id, artifact_type, external_system).
      // If an artifact already exists for that tuple, return it (optionally
      // applying any non-null fields from the payload as an update). This
      // makes repeat opens of the HTML preview overlay — and other
      // multi-click / double-mount races — produce a single row rather than
      // a duplicate on every attempt.
      case "create": {
        const {
          messageId,
          conversationId,
          artifactType,
          title,
          description,
          externalSystem,
          externalId,
          externalUrl,
          thumbnailUrl,
          metadata = {},
          organizationId,
          taskId,
        } = params;

        if (!messageId || !conversationId || !artifactType) {
          return NextResponse.json(
            {
              error: "messageId, conversationId, and artifactType are required",
            },
            { status: 400 },
          );
        }

        // Atomic get-or-create on the ANY-SURFACE natural key
        //   (user_id, source_system, source_id, artifact_index, artifact_type,
        //   external_system) backed by the FULL `NULLS NOT DISTINCT` unique index
        // `uq_cx_artifact_source_natural_key` (migration
        // chat_artifact_discovery_index_artifact_index.sql added artifact_index
        // so multi-artifact messages no longer 23505). This route is chat-only
        // and omits artifact_index (NULL) — one manual slot per message+type.
        // ON CONFLICT DO NOTHING (`ignoreDuplicates`) NEVER emits a 23505/409:
        // a concurrent create / double-mount overlay open returns an EMPTY
        // result instead of a duplicate row (the old select-then-insert had no
        // backing constraint, so its "idempotent" claim was fiction — it
        // silently produced duplicate rows under concurrency: 63 excess of 170).
        // `external_system` is nullable and NULLS NOT DISTINCT, so two NULLs
        // collide correctly (the common case). Normalize "" → null ONCE so the
        // write and the conflict-recovery read agree on what "absent" means
        // (otherwise an empty string writes as "" but reads via `.is(null)`).
        const normalizedExternalSystem = externalSystem || null;

        // `user_id` is the LAST legacy write left in this repo: it is the lead
        // column of `uq_cx_artifact_source_natural_key`, the dedup index this
        // upsert infers. Stopping the write before that index is rebuilt on
        // `created_by` would make every existing row invisible to ON CONFLICT
        // and reintroduce duplicate artifacts. Delete this line (and switch
        // `onConflict` below) in the same change that lands the new index.
        // Ownership itself is already canonical — `_stamp_actor` fills
        // `created_by`, and every read below keys on it.
        const insertRow = {
          message_id: messageId,
          conversation_id: conversationId,
          source_system: "cx_message",
          source_id: messageId,
          user_id: user.id,
          organization_id: organizationId ?? null,
          task_id: taskId ?? null,
          artifact_type: artifactType,
          status: "published" as const,
          external_system: normalizedExternalSystem,
          external_id: externalId ?? null,
          external_url: externalUrl ?? null,
          title: title ?? null,
          description: description ?? null,
          thumbnail_url: thumbnailUrl ?? null,
          metadata,
        };

        const { data: created, error: createError } = await supabase
          .schema("chat")
          .from("artifact")
          .upsert(insertRow, {
            onConflict:
              "user_id,source_system,source_id,artifact_index,artifact_type,external_system",
            ignoreDuplicates: true,
          })
          .select()
          .maybeSingle();

        if (createError) {
          console.error("[artifacts API] create error:", createError);
          return NextResponse.json(
            { error: createError.message },
            { status: 500 },
          );
        }

        // A row came back → we created it.
        if (created) {
          return NextResponse.json({ artifact: created });
        }

        // No row → the natural key already existed (DO NOTHING). The index is
        // FULL (spans archived/soft-deleted rows), so the existing row may be
        // archived — a "create" call means the user wants this artifact LIVE, so
        // REVIVE it (status→published, clear deleted_at) and apply the latest
        // publish fields (external_id/url change when the html_page is
        // re-created). Matched by the natural key (external_system nullable →
        // .is() when absent).
        const updates: TablesUpdate<{ schema: "chat" }, "artifact"> = {
          status: "published",
          deleted_at: null,
        };
        if (externalId !== undefined) updates.external_id = externalId;
        if (externalUrl !== undefined) updates.external_url = externalUrl;
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (thumbnailUrl !== undefined) updates.thumbnail_url = thumbnailUrl;

        let updateQuery = supabase
          .schema("chat")
          .from("artifact")
          .update(updates)
          .eq("created_by", user.id)
          .eq("source_system", "cx_message")
          .eq("source_id", messageId)
          .eq("artifact_type", artifactType);
        updateQuery = normalizedExternalSystem
          ? updateQuery.eq("external_system", normalizedExternalSystem)
          : updateQuery.is("external_system", null);

        const { data: updated, error: updateError } = await updateQuery
          .select()
          .single();

        if (updateError) {
          console.error("[artifacts API] create->update error:", updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 },
          );
        }

        return NextResponse.json({ artifact: updated });
      }

      // ── update ───────────────────────────────────────────────────────
      case "update": {
        const {
          id,
          status,
          title,
          description,
          externalSystem,
          externalId,
          externalUrl,
          thumbnailUrl,
          metadata,
        } = params;

        if (!id) {
          return NextResponse.json(
            { error: "id is required" },
            { status: 400 },
          );
        }

        const updates: TablesUpdate<{ schema: "chat" }, "artifact"> = {
          updated_at: new Date().toISOString(),
        };
        if (status !== undefined) updates.status = status;
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (externalSystem !== undefined)
          updates.external_system = externalSystem;
        if (externalId !== undefined) updates.external_id = externalId;
        if (externalUrl !== undefined) updates.external_url = externalUrl;
        if (thumbnailUrl !== undefined) updates.thumbnail_url = thumbnailUrl;
        if (metadata !== undefined) updates.metadata = metadata;

        const { data, error } = await supabase
          .schema("chat")
          .from("artifact")
          .update(updates)
          .eq("id", id)
          .eq("created_by", user.id)
          .select()
          .single();

        if (error) {
          console.error("[artifacts API] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
          return NextResponse.json(
            { error: "Artifact not found or access denied" },
            { status: 404 },
          );
        }

        return NextResponse.json({ artifact: data });
      }

      // ── archive (soft-delete) ─────────────────────────────────────────
      case "archive": {
        const { id } = params;
        if (!id) {
          return NextResponse.json(
            { error: "id is required" },
            { status: 400 },
          );
        }

        const { error } = await supabase
          .schema("chat")
          .from("artifact")
          .update({ status: "archived", deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("created_by", user.id);

        if (error) {
          console.error("[artifacts API] archive error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      // ── delete (hard) ─────────────────────────────────────────────────
      case "delete": {
        const { id } = params;
        if (!id) {
          return NextResponse.json(
            { error: "id is required" },
            { status: 400 },
          );
        }

        const { error } = await supabase
          .schema("chat")
          .from("artifact")
          .delete()
          .eq("id", id)
          .eq("created_by", user.id);

        if (error) {
          console.error("[artifacts API] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      // ── get ───────────────────────────────────────────────────────────
      case "get": {
        const { id } = params;
        if (!id) {
          return NextResponse.json(
            { error: "id is required" },
            { status: 400 },
          );
        }

        const { data, error } = await supabase
          .schema("chat")
          .from("artifact")
          .select("*")
          .eq("id", id)
          .eq("created_by", user.id)
          .is("deleted_at", null)
          .single();

        if (error) {
          console.error("[artifacts API] get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ artifact: data });
      }

      // ── list ──────────────────────────────────────────────────────────
      case "list": {
        const { filters = {} } = params;

        let query = supabase
          .schema("chat")
          .from("artifact")
          .select("*")
          .eq("created_by", user.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });

        if (filters.artifactType)
          query = query.eq("artifact_type", filters.artifactType);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.taskId) query = query.eq("task_id", filters.taskId);
        if (filters.conversationId)
          query = query.eq("conversation_id", filters.conversationId);

        const { data, error } = await query;

        if (error) {
          console.error("[artifacts API] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ artifacts: data ?? [] });
      }

      // ── listForMessage ────────────────────────────────────────────────
      case "listForMessage": {
        const { messageId } = params;
        if (!messageId) {
          return NextResponse.json(
            { error: "messageId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await supabase
          .schema("chat")
          .from("artifact")
          .select("*")
          .eq("message_id", messageId)
          .eq("created_by", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("[artifacts API] listForMessage error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ artifacts: data ?? [] });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[artifacts API] Unexpected error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
