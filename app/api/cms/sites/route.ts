/**
 * CMS Sites API Route — v4 (org-scoped + admin fleet visibility)
 *
 * Access actions (`list`, `get`, `create`, `update`, `delete`) resolve through
 * `../_lib/cmsAccess` — the owner PLUS the site's organization, per Arman's
 * ruling of 2026-08-15 ("of course they should be ORG scoped and shareable").
 * Before that, every action filtered on `owner_user_id = authenticated user`,
 * which is why an org's marketing site could point (via
 * `web.site.settings.cms.site_id`) at a CMS site no teammate could open.
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
import { getCmsClient, lookupCmsSiteAccess } from "../_lib/cmsDb";
import {
  canAccessCmsSite,
  cmsAccessSource,
  cmsVisibleSitesFilter,
  isCmsVisibility,
  resolveCmsCaller,
  type CmsAccessLevel,
  type CmsCaller,
} from "../_lib/cmsAccess";
import { logCmsActivity } from "../_lib/activityLog";
import {
  ResearchLineageValidationError,
  validateResearchLineageIds,
} from "../_lib/researchLineage";

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
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part)))
    return false;
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
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("The domain does not resolve to a public website.");
  }
}

function providerFromNameservers(nameservers: string[]): string | null {
  const joined = nameservers.join(" ").toLowerCase();
  if (joined.includes("cloudflare")) return "cloudflare";
  if (joined.includes("domaincontrol")) return "godaddy";
  if (joined.includes("registrar-servers")) return "namecheap";
  if (joined.includes("vercel-dns")) return "vercel";
  if (joined.includes("googledomains") || joined.includes("squarespacedns"))
    return "squarespace";
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

    // Resolved ONCE per request, never cached across requests: a revoked
    // membership must stop working on the very next call.
    const caller = await resolveCmsCaller(mainSupabase, user.id);

    /** Load a site's governance columns and gate it — the shared read+check. */
    const loadAccessibleSite = async (
      siteId: string,
      level: CmsAccessLevel,
      columns = "*",
    ): Promise<
      | { ok: true; site: Record<string, unknown> }
      | { ok: false; status: 403 | 404 }
    > => {
      const { data } = await db
        .from("client_sites")
        .select(columns)
        .eq("id", siteId)
        .single();
      if (!data) return { ok: false, status: 404 };
      const site = data as unknown as Record<string, unknown> & {
        owner_user_id: string | null;
        organization_id: string | null;
        visibility: string | null;
      };
      if (!canAccessCmsSite(caller, site, level))
        return { ok: false, status: 403 };
      return { ok: true, site };
    };

    switch (action) {
      case "list": {
        // No first-claim: an unowned site (owner_user_id is
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
        // Mine + my orgs'. `cmsVisibleSitesFilter` is the query form of the
        // access predicate; with no org memberships it returns null and we fall
        // back to the owner filter (an empty PostgREST `in.()` is a syntax
        // error, not an empty set).
        const orFilter = cmsVisibleSitesFilter(caller);
        let query = db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, organization_id, visibility, favicon, settings, created_at, updated_at, data_api_key",
          );
        query = orFilter
          ? query.or(orFilter)
          : query.eq("owner_user_id", user.id);

        const { data, error } = await query.order("name");

        if (error) {
          console.error("[cms/sites] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // `access` tells the UI HOW the caller reaches each row, so a
        // teammate's site is never silently indistinguishable from their own.
        const sites = (data ?? []).map(({ data_api_key, ...site }) => ({
          ...site,
          has_data_api_key: Boolean(data_api_key),
          access: cmsAccessSource(caller, site),
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

        const access = await lookupCmsSiteAccess(db, siteId, caller, "viewer");
        if (access.status === "error") {
          console.error("[cms/sites] get access lookup error:", access.error);
          return NextResponse.json(
            {
              error: "We could not check this site just now.",
              code: "transient",
            },
            { status: 500 },
          );
        }
        if (access.status !== "ok") {
          const denied = access.status === "denied";
          return NextResponse.json(
            {
              error: denied
                ? "You do not have access to this site."
                : "Site not found.",
              code: denied ? "denied" : "not_found",
            },
            { status: denied ? 403 : 404 },
          );
        }

        const { data: site, error } = await db
          .from("client_sites")
          .select("*")
          .eq("id", siteId)
          .single();
        if (error || !site) {
          console.error("[cms/sites] get row load error:", error);
          return NextResponse.json(
            {
              error: "We could not load this site just now.",
              code: "transient",
            },
            { status: 500 },
          );
        }

        return NextResponse.json({
          site: {
            ...site,
            access: cmsAccessSource(caller, site),
          },
        });
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
          organizationId,
          visibility,
        } = params;

        if (!name || !slug) {
          return NextResponse.json(
            { error: "name and slug are required" },
            { status: 400 },
          );
        }

        // The org a site is created into must be one the caller actually
        // belongs to — a client-supplied id is never trusted. Omitting it is
        // allowed and yields an owner-only site (fail closed, never a widening);
        // the UI always sends the caller's active org.
        if (organizationId !== undefined && organizationId !== null) {
          if (
            typeof organizationId !== "string" ||
            !caller.memberOrgIds.includes(organizationId)
          ) {
            return NextResponse.json(
              { error: "You are not a member of that organization." },
              { status: 403 },
            );
          }
        }

        if (visibility !== undefined && !isCmsVisibility(visibility)) {
          return NextResponse.json(
            { error: "visibility must be personal, internal, link or public." },
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
            created_by: user.id, // Audit stamp; ownership can transfer, this cannot
            organization_id: organizationId ?? null,
            // A company's website is org work — `personal` would hide it from
            // the very teammates this feature exists to include.
            visibility: visibility ?? "internal",
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

        // Editing a site's content is editor-level — org members hold it.
        const gate = await loadAccessibleSite(
          siteId,
          "editor",
          "id, domain, settings",
        );
        if (!gate.ok) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: gate.status },
          );
        }
        const existing = gate.site as {
          id: string;
          domain: string | null;
          settings: unknown;
        };

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
          const nextDomain =
            typeof updateData.domain === "string" && updateData.domain
              ? updateData.domain
              : null;
          if (nextDomain !== currentDomain) {
            const nextSettings = asSettings(
              updateData.settings ?? existing.settings,
            );
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

      // Cross-project research ids for an unpaired CMS site. Once web_site_id
      // exists, canonical platform.associations are the preferred writer; the
      // arrays remain readable so no draft lineage can disappear mid-pairing.
      case "set-research-lineage": {
        const { siteId, researchTopicIds, researchTagIds } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }
        const lineageGate = await loadAccessibleSite(siteId, "editor", "id");
        if (!lineageGate.ok) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: lineageGate.status },
          );
        }
        try {
          const { topicIds, tagIds } = await validateResearchLineageIds(
            mainSupabase,
            researchTopicIds,
            researchTagIds,
          );
          const { data, error } = await db
            .from("client_sites")
            .update({ research_topic_ids: topicIds, research_tag_ids: tagIds })
            .eq("id", siteId)
            .select()
            .single();
          if (error) throw error;
          await logCmsActivity(db, {
            siteId,
            activityType: "site.research_lineage",
            entityType: "site",
            entityId: siteId,
            description: "Updated site research lineage",
            userId: user.id,
            userEmail: user.email,
            changes: {
              research_topic_ids: topicIds,
              research_tag_ids: tagIds,
            },
          });
          return NextResponse.json({ success: true, site: data });
        } catch (lineageError) {
          if (lineageError instanceof ResearchLineageValidationError) {
            return NextResponse.json(
              { error: lineageError.message },
              { status: 400 },
            );
          }
          throw lineageError;
        }
      }

      case "use_platform_domain": {
        const { siteId } = params;
        if (!siteId)
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        const domainGate = await loadAccessibleSite(
          siteId,
          "editor",
          "id, slug, domain, settings",
        );
        if (!domainGate.ok)
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: domainGate.status },
          );
        const site = domainGate.site as {
          id: string;
          slug: string;
          domain: string | null;
          settings: unknown;
        };
        const settings = asSettings(site.settings);
        const prior = asSettings(settings.domain_traffic);
        settings.domain_traffic = { ...prior, mode: "platform" };
        const { data, error } = await db
          .from("client_sites")
          .update({ settings })
          .eq("id", siteId)
          .select()
          .single();
        if (error)
          return NextResponse.json({ error: error.message }, { status: 500 });
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
        if (!siteId)
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        const domainGate = await loadAccessibleSite(
          siteId,
          "editor",
          "id, slug, domain, settings",
        );
        if (!domainGate.ok)
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: domainGate.status },
          );
        const site = domainGate.site as {
          id: string;
          slug: string;
          domain: string | null;
          settings: unknown;
        };
        const domain = typeof site.domain === "string" ? site.domain : "";
        if (!domain) {
          return NextResponse.json(
            { error: "Save the desired domain before checking it." },
            { status: 400 },
          );
        }
        const checkedAt = new Date().toISOString();
        const provider = await detectDnsProvider(domain);
        let verified = false;
        let verificationError: string | null = null;
        try {
          await assertPublicDns(domain);
          const response = await fetch(
            `https://${domain}/__matrx-domain-verification`,
            {
              cache: "no-store",
              redirect: "manual",
              signal: AbortSignal.timeout(8_000),
              headers: { Accept: "application/json" },
            },
          );
          if (!response.ok) {
            throw new Error(
              `The verification page returned HTTP ${response.status}.`,
            );
          }
          const marker = (await response.json()) as Record<string, unknown>;
          if (
            marker.service !== "mymatrx" ||
            marker.siteSlug !== site.slug ||
            marker.domain !== domain
          ) {
            throw new Error(
              "The domain reached a website, but not this Matrx site.",
            );
          }
          verified = true;
        } catch (error) {
          verificationError =
            error instanceof Error
              ? error.message
              : "The domain could not be verified.";
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
          .select()
          .single();
        if (error)
          return NextResponse.json({ error: error.message }, { status: 500 });
        await logCmsActivity(db, {
          siteId,
          activityType: verified
            ? "site.domain_verified"
            : "site.domain_check_failed",
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

        // ADMIN, not editor: per the platform's share levels, edit has never
        // meant delete. An org teammate can build this site; only the owner or
        // an org admin can destroy it.
        const deleteGate = await loadAccessibleSite(
          siteId,
          "admin",
          "id, slug, name",
        );
        const site = deleteGate.ok
          ? (deleteGate.site as { id: string; slug: string; name: string })
          : null;

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
        const { error } = await db
          .from("client_sites")
          .delete()
          .eq("id", siteId);

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
          changes: {
            slug: site.slug,
            forced: !!force,
            pageCount: pageCount ?? 0,
          },
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
            {
              error: `agentWritePolicy must be one of: ${AGENT_WRITE_POLICIES.join(", ")}`,
            },
            { status: 400 },
          );
        }

        const { data: existing, error: fetchError } = await db
          .from("client_sites")
          .select("id, name, settings")
          .eq("id", siteId)
          .single();

        if (fetchError || !existing) {
          return NextResponse.json(
            { error: "Site not found" },
            { status: 404 },
          );
        }

        const nextSettings = {
          ...(existing.settings ?? {}),
          ...(agentWritePolicy !== undefined
            ? { agent_write_policy: agentWritePolicy }
            : {}),
          ...(policyOverrides !== undefined
            ? { policy_overrides: policyOverrides }
            : {}),
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
          ? (data ?? []).filter(
              (row) =>
                (row.changes as { actor?: string } | null)?.actor === actor,
            )
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
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Forbidden")
      ? 403
      : message.startsWith("Unauthorized")
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
