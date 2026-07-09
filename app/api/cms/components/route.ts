/**
 * CMS Components API Route — v3 (ownership-secured, delete fixed)
 *
 * All actions verify the component's site is owned by the authenticated user.
 * `delete` previously had no case here while the FE service called it anyway,
 * producing a live 400 ("Unknown action") — see master plan §3 known defects.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { getCmsClient, verifySiteOwnership, verifyComponentOwnership } from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...params } = body;
    const db = getCmsClient();

    switch (action) {
      case "list": {
        const { siteId } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("client_components")
          .select("*")
          .eq("client_id", siteId)
          .order("component_type")
          .order("name");

        if (error) {
          console.error("[cms/components] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ components: data ?? [] });
      }

      case "get": {
        const { componentId } = params;
        if (!componentId) {
          return NextResponse.json(
            { error: "componentId is required" },
            { status: 400 },
          );
        }

        const { data: comp, error } = await db
          .from("client_components")
          .select("*")
          .eq("id", componentId)
          .single();

        if (error || !comp) {
          return NextResponse.json(
            { error: "Component not found" },
            { status: 404 },
          );
        }

        if (!(await verifySiteOwnership(db, comp.client_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json({ component: comp });
      }

      case "create": {
        const { siteId, componentType, name, htmlContent, cssContent } = params;
        if (!siteId || !componentType || !name) {
          return NextResponse.json(
            { error: "siteId, componentType, and name are required" },
            { status: 400 },
          );
        }

        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("client_components")
          .insert({
            client_id: siteId,
            component_type: componentType,
            name,
            html_content: htmlContent || "",
            css_content: cssContent || null,
          })
          .select()
          .single();

        if (error) {
          console.error("[cms/components] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId,
          activityType: "component.create",
          entityType: "component",
          entityId: data.id,
          description: `Created ${data.component_type} component "${data.name}"`,
          userId: user.id,
          userEmail: user.email,
        });

        return NextResponse.json({ success: true, component: data });
      }

      case "update": {
        const { componentId, ...updateFields } = params;
        if (!componentId) {
          return NextResponse.json(
            { error: "componentId is required" },
            { status: 400 },
          );
        }

        const { ok, clientId } = await verifyComponentOwnership(db, componentId, user.id);
        if (!ok) {
          return NextResponse.json({ error: "Component not found or access denied" }, { status: 403 });
        }

        const fieldMap: Record<string, string> = {
          name: "name",
          componentType: "component_type",
          htmlContent: "html_content",
          htmlContentDraft: "html_content_draft",
          cssContent: "css_content",
          cssContentDraft: "css_content_draft",
          isActive: "is_active",
          hasDraft: "has_draft",
        };

        const updateData: Record<string, unknown> = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
          if (updateFields[camel] !== undefined) {
            updateData[snake] = updateFields[camel];
          }
        }

        const { data, error } = await db
          .from("client_components")
          .update(updateData)
          .eq("id", componentId)
          .select()
          .single();

        if (error) {
          console.error("[cms/components] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: clientId,
          activityType: "component.update",
          entityType: "component",
          entityId: componentId,
          description: `Updated component "${data.name}" (${Object.keys(updateData).join(", ")})`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(updateData) },
        });

        return NextResponse.json({ success: true, component: data });
      }

      // ── Delete component (was missing — live 400 bug) ─────────────
      case "delete": {
        const { componentId } = params;
        if (!componentId) {
          return NextResponse.json(
            { error: "componentId is required" },
            { status: 400 },
          );
        }

        const { data: comp } = await db
          .from("client_components")
          .select("client_id, name, component_type")
          .eq("id", componentId)
          .single();

        if (!comp) {
          return NextResponse.json({ error: "Component not found" }, { status: 404 });
        }

        if (!(await verifySiteOwnership(db, comp.client_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const { error } = await db
          .from("client_components")
          .delete()
          .eq("id", componentId);

        if (error) {
          console.error("[cms/components] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: comp.client_id,
          activityType: "component.delete",
          entityType: "component",
          entityId: componentId,
          description: `Deleted ${comp.component_type} component "${comp.name}"`,
          userId: user.id,
          userEmail: user.email,
        });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/components] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
