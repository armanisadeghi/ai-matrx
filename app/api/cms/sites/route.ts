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
import { lookup, resolveNs } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { getCmsClient } from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";

const AGENT_WRITE_POLICIES = ["blocked", "draft_only", "full"] as const;
type AgentWritePolicy = (typeof AGENT_WRITE_POLICIES)[number];

type SiteSettings = Record<string, unknown>;

function asSettings(value: unknown): SiteSettings {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as SiteSettings) }
    : {};
}

function isPublicAddress(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    return !(
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    );
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicDns(domain: string): Promise<void> {
  if (isIP(domain)) throw new Error("Enter a domain name, not an IP address.");
  const addresses = await lookup(domain, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The domain does not resolve to a public website.");
  }
}

function providerFromNameservers(nameservers: string[]): string | null {
  const joined = nameservers.join(" ").toLowerCase();
  if (joined.includes("cloudflare")) return "cloudflare";
  if (joined.includes("domaincontrol")) return "godaddy";
  if (joined.includes("registrar-servers")) return "namecheap";
  if (joined.includes("vercel-dns")) return "vercel";
  if (joined.includes("googledomains") || joined.includes("squarespacedns")) return "squarespace";
  if (joined.includes("ui-dns")) return "ionos";
  if (joined.includes("awsdns")) return "route53";
  if (joined.includes("wixdns")) return "wix";
  return null;
}

async function detectDnsProvider(domain: string): Promise<string | null> {
  try {
    const labels = domain.split(".");
    const root = labels.length > 2 ? labels.slice(-2).join(".") : domain;
    return providerFromNameservers(await resolveNs(root));
  } catch {
    return null;
  }
}

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

        // SUMMARY columns only — the client type for this response is
        // `ClientSiteSummary`, not `ClientSite`. Keep the two in lockstep.
        // `data_api_key` is read but NEVER returned: consumers only ever need
        // to know whether one exists, and its value belongs in the Collections
        // tab where it can be revealed/rotated deliberately. Returning the row
        // without it while typing the response `ClientSite[]` is exactly how
        // `has_data_api_key` reported false for every site that has one.
        const { data, error } = await db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, favicon, settings, created_at, updated_at, data_api_key",
          )
          .eq("owner_user_id", user.id)
          .order("name");

        if (error) {
          console.error("[cms/sites] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sites = (data ?? []).map(({ data_api_key, ...site }) => ({
          ...site,
          has_data_api_key: Boolean(data_api_key),
        }));
        return NextResponse.json({ sites });
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

        const initialSettings = asSettings(settings);
        if (domain && !("domain_traffic" in initialSettings)) {
          initialSettings.domain_traffic = {
            mode: "platform",
            verified_domain: null,
            verified_at: null,
            last_checked_at: null,
            last_error: "Connection has not been checked for this domain yet.",
          };
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
            settings: initialSettings,
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
          .select("id, domain, settings")
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

        if (Object.prototype.hasOwnProperty.call(updateData, "domain")) {
          const currentDomain = existing.domain ?? null;
          const nextDomain = typeof updateData.domain === "string" && updateData.domain
            ? updateData.domain
            : null;
          if (nextDomain !== currentDomain) {
            const nextSettings = asSettings(updateData.settings ?? existing.settings);
            nextSettings.domain_traffic = {
              mode: "platform",
              verified_domain: null,
              verified_at: null,
              last_checked_at: null,
              last_error: nextDomain
                ? "Connection has not been checked for this domain yet."
                : null,
            };
            updateData.settings = nextSettings;
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

      case "use_platform_domain": {
        const { siteId } = params;
        if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
        const { data: site } = await db
          .from("client_sites")
          .select("id, slug, domain, settings")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();
        if (!site) return NextResponse.json({ error: "Site not found or access denied" }, { status: 403 });
        const settings = asSettings(site.settings);
        const prior = asSettings(settings.domain_traffic);
        settings.domain_traffic = { ...prior, mode: "platform" };
        const { data, error } = await db
          .from("client_sites")
          .update({ settings })
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .select()
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logCmsActivity(db, {
          siteId,
          activityType: "site.domain_platform",
          entityType: "site",
          entityId: siteId,
          description: `Sent generated traffic to the Matrx URL for ${site.domain || site.slug}`,
          userId: user.id,
          userEmail: user.email,
        });
        return NextResponse.json({ success: true, site: data });
      }

      case "verify_domain": {
        const { siteId } = params;
        if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
        const { data: site } = await db
          .from("client_sites")
          .select("id, slug, domain, settings")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();
        if (!site) return NextResponse.json({ error: "Site not found or access denied" }, { status: 403 });
        const domain = typeof site.domain === "string" ? site.domain : "";
        if (!domain) {
          return NextResponse.json({ error: "Save the desired domain before checking it." }, { status: 400 });
        }
        const checkedAt = new Date().toISOString();
        const provider = await detectDnsProvider(domain);
        let verified = false;
        let verificationError: string | null = null;
        try {
          await assertPublicDns(domain);
          const response = await fetch(`https://${domain}/__matrx-domain-verification`, {
            cache: "no-store",
            redirect: "manual",
            signal: AbortSignal.timeout(8_000),
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error(`The verification page returned HTTP ${response.status}.`);
          }
          const marker = (await response.json()) as Record<string, unknown>;
          if (
            marker.service !== "mymatrx" ||
            marker.siteSlug !== site.slug ||
            marker.domain !== domain
          ) {
            throw new Error("The domain reached a website, but not this Matrx site.");
          }
          verified = true;
        } catch (error) {
          verificationError = error instanceof Error ? error.message : "The domain could not be verified.";
        }

        const settings = asSettings(site.settings);
        settings.domain_traffic = {
          mode: verified ? "custom" : "platform",
          verified_domain: verified ? domain : null,
          verified_at: verified ? checkedAt : null,
          last_checked_at: checkedAt,
          last_error: verificationError,
          provider,
        };
        const { data, error } = await db
          .from("client_sites")
          .update({ settings })
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .select()
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logCmsActivity(db, {
          siteId,
          activityType: verified ? "site.domain_verified" : "site.domain_check_failed",
          entityType: "site",
          entityId: siteId,
          description: verified
            ? `Verified ${domain}; generated traffic now uses the custom domain`
            : `Could not verify ${domain}; generated traffic remains on the Matrx URL`,
          userId: user.id,
          userEmail: user.email,
          changes: { domain, provider, error: verificationError },
        });
        return NextResponse.json({
          verified,
          domain,
          provider,
          checkedAt,
          error: verificationError,
          site: data,
        });
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

        // Same SUMMARY contract as `list` above — `ClientSiteSummary`, never a
        // full row. `data_api_key` is read only to compute the boolean and is
        // stripped before it leaves the route.
        const { data, error } = await db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, favicon, settings, created_at, updated_at, data_api_key",
          )
          .order("name");

        if (error) {
          console.error("[cms/sites] admin_list_sites error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sites = (data ?? []).map(({ data_api_key, ...site }) => ({
          ...site,
          has_data_api_key: Boolean(data_api_key),
        }));
        return NextResponse.json({ sites });
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
          // Unique tiebreak LAST — unstable-pagination guard (ties are common on bulk-seeded rows).
          .order("id", { ascending: false })
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
