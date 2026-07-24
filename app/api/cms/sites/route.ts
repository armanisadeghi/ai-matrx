/**
 * CMS Sites API Route — v3 (ownership-secured + admin fleet visibility)
 *
 * Owner-scoped actions (`list`, `get`, `create`, `update`, `delete`) filter by
 * `owner_user_id = authenticated user` — mirrors P1's service-layer semantics so the
 * UI and agent tools behave identically (master plan §6.1).
 *
 * `admin_*` actions bypass per-user ownership and are gated by `requireSuperAdmin`
 * instead — they back the fleet-wide agent-activity visibility surface at
 * `/administration/knowledge/cms-agents`, which needs to see every site regardless of which
 * user account owns it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  getCmsClient,
  verifySiteOwnership,
} from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";

const AGENT_WRITE_POLICIES = ["blocked", "draft_only", "full"] as const;
type AgentWritePolicy = (typeof AGENT_WRITE_POLICIES)[number];

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
        // Owner-scoped only. No first-claim: an unowned site (owner_user_id is
        // null) simply does not appear here — silently claiming it for whoever
        // lists first was a live bug (master plan §3 "Known defects", F2). If one
        // ever surfaces, log it loudly instead of mutating data on a read.
        const { data: unclaimed } = await db
          .from("client_sites")
          .select("id, slug")
          .is("owner_user_id", null);
        if (unclaimed && unclaimed.length > 0) {
          console.warn(
            `[cms/sites] ${unclaimed.length} unowned site(s) found on list — NOT auto-claiming (F2). ` +
              `Assign an owner explicitly: ${unclaimed.map((s) => s.slug).join(", ")}`,
          );
        }

        const { data, error } = await db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, favicon, settings, created_at, updated_at",
          )
          .eq("owner_user_id", user.id)
          .order("name");

        if (error) {
          console.error("[cms/sites] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ sites: data ?? [] });
      }

      case "get": {
        const { siteId } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from("client_sites")
          .select("*")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();

        if (error) {
          console.error("[cms/sites] get error:", error);
          const status = error.code === "PGRST116" ? 404 : 500;
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status },
          );
        }

        return NextResponse.json({ site: data });
      }

      case "create": {
        const {
          name,
          slug,
          domain,
          themeConfig,
          navigation,
          footerConfig,
          metaDefaults,
          contactInfo,
          socialLinks,
          settings,
          globalCss,
          favicon,
        } = params;

        if (!name || !slug) {
          return NextResponse.json(
            { error: "name and slug are required" },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from("client_sites")
          .insert({
            name,
            slug,
            domain: domain || null,
            owner_user_id: user.id, // Always set to authenticated user
            theme_config: themeConfig || {},
            navigation: navigation || [],
            footer_config: footerConfig || {},
            meta_defaults: metaDefaults || {},
            contact_info: contactInfo || {},
            social_links: socialLinks || {},
            settings: settings || {},
            global_css: globalCss || null,
            favicon: favicon || null,
          })
          .select()
          .single();

        if (error) {
          console.error("[cms/sites] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: data.id,
          activityType: "site.create",
          entityType: "site",
          entityId: data.id,
          description: `Created site "${data.name}" (${data.slug})`,
          userId: user.id,
          userEmail: user.email,
        });

        return NextResponse.json({ success: true, site: data });
      }

      case "update": {
        const { siteId, ...updateFields } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        // Verify ownership before updating
        const { data: existing } = await db
          .from("client_sites")
          .select("id")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();

        if (!existing) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const fieldMap: Record<string, string> = {
          name: "name",
          slug: "slug",
          domain: "domain",
          themeConfig: "theme_config",
          navigation: "navigation",
          footerConfig: "footer_config",
          metaDefaults: "meta_defaults",
          contactInfo: "contact_info",
          socialLinks: "social_links",
          settings: "settings",
          isActive: "is_active",
          globalCss: "global_css",
          favicon: "favicon",
        };

        const updateData: Record<string, unknown> = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
          if (updateFields[camel] !== undefined) {
            updateData[snake] = updateFields[camel];
          }
        }

        const { data, error } = await db
          .from("client_sites")
          .update(updateData)
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .select()
          .single();

        if (error) {
          console.error("[cms/sites] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId,
          activityType: "site.update",
          entityType: "site",
          entityId: siteId,
          description: `Updated site "${data.name}" (${Object.keys(updateData).join(", ")})`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(updateData) },
        });

        return NextResponse.json({ success: true, site: data });
      }

      // ── Delete site (guarded) ──────────────────────────────────────
      case "delete": {
        const { siteId, force } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        const { data: site } = await db
          .from("client_sites")
          .select("id, slug, name")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();

        if (!site) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { count: pageCount } = await db
          .from("client_pages")
          .select("id", { count: "exact", head: true })
          .eq("client_id", siteId);

        if ((pageCount ?? 0) > 0 && !force) {
          return NextResponse.json(
            {
              error: `Site "${site.name}" has ${pageCount} page(s). Pass force=true to delete anyway.`,
              pageCount,
            },
            { status: 409 },
          );
        }

        // FK chain (client_pages, client_components, client_assets,
        // client_activity_log) is ON DELETE CASCADE — verified live against
        // viyklljfdhtidwecakwx (2026-07-10). Page history in
        // `history.row_versions` has no FK and is deliberately NOT cascaded:
        // the append-only log outlives the rows it describes.
        const { error } = await db.from("client_sites").delete().eq("id", siteId);

        if (error) {
          console.error("[cms/sites] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Logged after delete with client_id null — the FK cascade already
        // removed any rows scoped to this site, and the row must survive the
        // site it describes so the deletion itself stays visible in the feed.
        await logCmsActivity(db, {
          siteId: null,
          activityType: "site.delete",
          entityType: "site",
          entityId: siteId,
          description: `Deleted site "${site.name}" (${site.slug})${force && (pageCount ?? 0) > 0 ? ` — forced, ${pageCount} page(s)` : ""}`,
          userId: user.id,
          userEmail: user.email,
          changes: { slug: site.slug, forced: !!force, pageCount: pageCount ?? 0 },
        });

        return NextResponse.json({ success: true });
      }

      // ── Admin: fleet-wide reads/writes, requireSuperAdmin ────────────
      case "admin_list_sites": {
        await requireSuperAdmin();

        const { data, error } = await db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, settings, created_at, updated_at",
          )
          .order("name");

        if (error) {
          console.error("[cms/sites] admin_list_sites error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ sites: data ?? [] });
      }

      case "admin_update_policy": {
        await requireSuperAdmin();
        const { siteId, agentWritePolicy, policyOverrides } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }
        if (
          agentWritePolicy !== undefined &&
          !AGENT_WRITE_POLICIES.includes(agentWritePolicy as AgentWritePolicy)
        ) {
          return NextResponse.json(
            { error: `agentWritePolicy must be one of: ${AGENT_WRITE_POLICIES.join(", ")}` },
            { status: 400 },
          );
        }

        const { data: existing, error: fetchError } = await db
          .from("client_sites")
          .select("id, name, settings")
          .eq("id", siteId)
          .single();

        if (fetchError || !existing) {
          return NextResponse.json({ error: "Site not found" }, { status: 404 });
        }

        const nextSettings = {
          ...(existing.settings ?? {}),
          ...(agentWritePolicy !== undefined ? { agent_write_policy: agentWritePolicy } : {}),
          ...(policyOverrides !== undefined ? { policy_overrides: policyOverrides } : {}),
        };

        const { data, error } = await db
          .from("client_sites")
          .update({ settings: nextSettings })
          .eq("id", siteId)
          .select()
          .single();

        if (error) {
          console.error("[cms/sites] admin_update_policy error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId,
          activityType: "site.policy_update",
          entityType: "site",
          entityId: siteId,
          description: `Set agent_write_policy=${agentWritePolicy ?? "(unchanged)"} on "${existing.name}"`,
          userId: user.id,
          userEmail: user.email,
          changes: { agentWritePolicy, policyOverrides },
        });

        return NextResponse.json({ success: true, site: data });
      }

      case "admin_list_activity": {
        await requireSuperAdmin();
        const { siteId, entityType, actor, limit } = params;

        let query = db
          .from("client_activity_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(typeof limit === "number" ? Math.min(limit, 500) : 200);

        if (siteId) query = query.eq("client_id", siteId);
        if (entityType) query = query.eq("entity_type", entityType);

        const { data, error } = await query;

        if (error) {
          console.error("[cms/sites] admin_list_activity error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // `actor` lives inside the `changes` jsonb (C6) — filter in app code.
        const rows = actor
          ? (data ?? []).filter((row) => (row.changes as { actor?: string } | null)?.actor === actor)
          : (data ?? []);

        return NextResponse.json({ activity: rows });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/sites] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
