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
      //   (user_id, message_id, artifact_type, external_system).
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
          projectId,
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

        // Look up any existing artifact for this (user, message, type,
        // external_system) tuple. `external_system` is nullable so we
        // normalize NULL via .is() when not provided.
        let existingQuery = supabase
          .schema("chat").from("artifact")
          .select("*")
          .eq("user_id", user.id)
          .eq("message_id", messageId)
          .eq("artifact_type", artifactType)
          .is("deleted_at", null)
          .limit(1);

        if (externalSystem) {
          existingQuery = existingQuery.eq("external_system", externalSystem);
        } else {
          existingQuery = existingQuery.is("external_system", null);
        }

        const { data: existing, error: lookupError } = await existingQuery;

        if (lookupError) {
          console.error("[artifacts API] create lookup error:", lookupError);
          return NextResponse.json(
            { error: lookupError.message },
            { status: 500 },
          );
        }

        if (existing && existing.length > 0) {
          // Apply a lightweight update with the caller-provided fields so
          // the returned row reflects the latest publish (external_id can
          // change when the underlying html_page row is re-created).
          const updates: TablesUpdate<{ schema: "chat" }, "artifact"> = {};
          if (externalId !== undefined) updates.external_id = externalId;
          if (externalUrl !== undefined) updates.external_url = externalUrl;
          if (title !== undefined) updates.title = title;
          if (description !== undefined) updates.description = description;
          if (thumbnailUrl !== undefined) updates.thumbnail_url = thumbnailUrl;

          if (Object.keys(updates).length === 0) {
            return NextResponse.json({ artifact: existing[0] });
          }

          const { data: updated, error: updateError } = await supabase
            .schema("chat").from("artifact")
            .update(updates)
            .eq("id", existing[0].id)
            .eq("user_id", user.id)
            .select()
            .single();

          if (updateError) {
            console.error(
              "[artifacts API] create->update error:",
              updateError,
            );
            return NextResponse.json(
              { error: updateError.message },
              { status: 500 },
            );
          }

          return NextResponse.json({ artifact: updated });
        }

        const { data, error } = await supabase
          .schema("chat").from("artifact")
          .insert({
            message_id: messageId,
            conversation_id: conversationId,
            user_id: user.id,
            organization_id: organizationId ?? null,
            project_id: projectId ?? null,
            task_id: taskId ?? null,
            artifact_type: artifactType,
            status: "published",
            external_system: externalSystem ?? null,
            external_id: externalId ?? null,
            external_url: externalUrl ?? null,
            title: title ?? null,
            description: description ?? null,
            thumbnail_url: thumbnailUrl ?? null,
            metadata: metadata,
          })
          .select()
          .single();

        if (error) {
          console.error("[artifacts API] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ artifact: data });
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
          .schema("chat").from("artifact")
          .update(updates)
          .eq("id", id)
          .eq("user_id", user.id)
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
          .schema("chat").from("artifact")
          .update({ status: "archived", deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id);

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
          .schema("chat").from("artifact")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

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
          .schema("chat").from("artifact")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
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
          .schema("chat").from("artifact")
          .select("*")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });

        if (filters.artifactType)
          query = query.eq("artifact_type", filters.artifactType);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.projectId)
          query = query.eq("project_id", filters.projectId);
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
          .schema("chat").from("artifact")
          .select("*")
          .eq("message_id", messageId)
          .eq("user_id", user.id)
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
