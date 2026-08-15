import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { isUuid } from "@/features/scopes/service/associationGuards";
import {
  CMS_SITE_MEMBER_ADD_ACTION,
  cmsAccessGateLabel,
  cmsSiteAccessRequestKey,
  isCmsAccessGateToken,
  type CmsAccessGateToken,
} from "@/features/cms/accessGateTokens";
import { resolveCmsCaller, type CmsCaller } from "../_lib/cmsAccess";
import {
  getCmsClient,
  lookupCmsPageAccess,
  lookupCmsSiteAccess,
  type CmsPageAccessRecord,
  type CmsSiteAccessRecord,
} from "../_lib/cmsDb";

type ResolvedTarget = {
  token: CmsAccessGateToken;
  id: string;
  title: string | null;
  site: CmsSiteAccessRecord;
  page: CmsPageAccessRecord | null;
  access: "ok" | "denied";
};

type RequestRecipient = {
  user_id: string;
  reason: "owner" | "org_admin";
  display_name: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function anonymousPayload(token: CmsAccessGateToken) {
  return {
    exists: null,
    deleted: null,
    level: "none",
    is_owner: false,
    disclosure: "anonymous",
    entity: { token, label: cmsAccessGateLabel(token) },
    owner: null,
    organization: null,
    ancestor: null,
    request: null,
    can_request: false,
  };
}

function missingPayload(token: CmsAccessGateToken) {
  return {
    exists: false,
    deleted: false,
    level: "none",
    is_owner: false,
    disclosure: "none",
    entity: { token, label: cmsAccessGateLabel(token) },
    owner: null,
    organization: null,
    ancestor: null,
    request: null,
    can_request: false,
  };
}

async function resolveTarget(
  token: CmsAccessGateToken,
  id: string,
  caller: CmsCaller,
): Promise<
  | { status: "ok"; target: ResolvedTarget }
  | { status: "not_found" }
  | { status: "error"; error: unknown }
> {
  const db = getCmsClient();
  if (token === "client_site") {
    const result = await lookupCmsSiteAccess(db, id, caller, "viewer");
    if (result.status === "not_found" || result.status === "error")
      return result;
    return {
      status: "ok",
      target: {
        token,
        id,
        title: result.site.name,
        site: result.site,
        page: null,
        access: result.status,
      },
    };
  }

  const result = await lookupCmsPageAccess(db, id, caller, "viewer");
  if (result.status === "not_found" || result.status === "error") return result;
  return {
    status: "ok",
    target: {
      token,
      id,
      title: result.page.title,
      site: result.site,
      page: result.page,
      access: result.status,
    },
  };
}

async function recipientsForTarget(
  target: ResolvedTarget,
): Promise<RequestRecipient[]> {
  if (!target.site.organization_id) return [];
  const ids = new Map<string, RequestRecipient["reason"]>();
  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("iam")
    .from("organization_member")
    .select("user_id, role")
    .eq("organization_id", target.site.organization_id)
    .in("role", ["owner", "admin"]);
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.user_id || ids.has(row.user_id)) continue;
    ids.set(row.user_id, row.role === "owner" ? "owner" : "org_admin");
  }

  const userIds = [...ids.keys()];
  if (userIds.length === 0) return [];
  const { data: profiles, error: profileError } = await admin
    .schema("users")
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (profileError) throw profileError;
  const names = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  return userIds.map((userId) => ({
    user_id: userId,
    reason: ids.get(userId) ?? "owner",
    display_name: names.get(userId) ?? null,
  }));
}

async function requestSummary(userId: string, site: CmsSiteAccessRecord) {
  if (!site.organization_id) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("iam")
    .from("access_requests")
    .select("id, status, requested_level, created_at, decision_note")
    .eq("resource_type", "organization")
    .eq("resource_id", site.organization_id)
    .eq("created_by", userId)
    .eq("request_kind", "setting")
    .eq("request_key", cmsSiteAccessRequestKey(site.id))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    level: data.requested_level,
    created_at: data.created_at,
    decision_note: data.decision_note,
  };
}

async function resolvedPayload(
  target: ResolvedTarget,
  caller: CmsCaller,
  userId: string,
) {
  const admin = createAdminClient();
  const [request, recipients] = await Promise.all([
    requestSummary(userId, target.site),
    target.access === "denied"
      ? recipientsForTarget(target)
      : Promise.resolve([]),
  ]);

  let owner = null;
  if (target.site.owner_user_id) {
    const { data, error } = await admin
      .schema("users")
      .from("profiles")
      .select("id, display_name, avatar_url, creator_handle, creator_public")
      .eq("id", target.site.owner_user_id)
      .maybeSingle();
    if (error) throw error;
    owner = {
      user_id: target.site.owner_user_id,
      display_name: data?.display_name ?? null,
      avatar_url: data?.avatar_url ?? null,
      creator_handle: data?.creator_public ? data.creator_handle : null,
    };
  }

  let organization = null;
  if (target.site.organization_id) {
    const { data, error } = await admin
      .schema("iam")
      .from("organizations")
      .select("id, name, is_personal")
      .eq("id", target.site.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      organization = {
        id: data.id,
        name: data.name,
        is_personal: data.is_personal,
        viewer_is_member: caller.memberOrgIds.includes(data.id),
      };
    }
  }

  return {
    exists: true,
    deleted: false,
    level: target.access === "ok" ? "view" : "none",
    is_owner: target.site.owner_user_id === userId,
    disclosure: "full",
    entity: {
      token: target.token,
      label: cmsAccessGateLabel(target.token),
      title: target.title,
    },
    owner,
    organization,
    ancestor: null,
    request,
    can_request:
      target.access === "denied" &&
      recipients.length > 0 &&
      request?.status !== "pending" &&
      request?.status !== "reported",
  };
}

async function createRequest(
  target: ResolvedTarget,
  userId: string,
  message: string | null,
) {
  if (target.access !== "denied") {
    return NextResponse.json(
      {
        error: "You already have access to this site.",
        code: "already_allowed",
      },
      { status: 409 },
    );
  }

  const recipients = await recipientsForTarget(target);
  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error: "There is no one available to receive this request.",
        code: "no_recipient",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const organizationId = target.site.organization_id;
  if (!organizationId) {
    return NextResponse.json(
      {
        error: "This site does not have an organization that can grant access.",
        code: "no_organization",
      },
      { status: 409 },
    );
  }

  const existing = await requestSummary(userId, target.site);
  if (existing?.status === "pending") {
    return NextResponse.json({
      request_id: existing.id,
      already: true,
      recipients: [],
      site_id: target.site.id,
      site_name: target.site.name,
      organization_id: target.site.organization_id,
    });
  }
  if (existing?.status === "reported") {
    return NextResponse.json(
      {
        error: "You can no longer request access to this site.",
        code: "reported",
      },
      { status: 403 },
    );
  }

  const { count, error: countError } = await admin
    .schema("iam")
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .is("deleted_at", null)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if (countError) throw countError;
  if ((count ?? 0) >= 25) {
    return NextResponse.json(
      {
        error:
          "You have sent a lot of access requests today. Try again tomorrow.",
        code: "rate_limited",
      },
      { status: 429 },
    );
  }

  const mainSupabase = await createMainSupabaseClient();
  const { data: personalOrgId, error: orgError } = await mainSupabase.rpc(
    "current_personal_org_id",
  );
  if (orgError || !personalOrgId)
    throw orgError ?? new Error("Personal organization missing");

  const href = `/organizations/${organizationId}/settings#members`;
  const settingLabel = target.site.name
    ? `Access to CMS site “${target.site.name}”`
    : "Access to a CMS site";
  const actionPayload = {
    organization_id: organizationId,
    user_id: userId,
    cms_site_id: target.site.id,
    cms_site_name: target.site.name,
  };
  const { data, error } = await admin
    .schema("iam")
    .from("access_requests")
    .insert({
      organization_id: personalOrgId,
      created_by: userId,
      resource_type: "organization",
      resource_id: organizationId,
      requested_level: "viewer",
      message,
      request_kind: "setting",
      request_key: cmsSiteAccessRequestKey(target.site.id),
      request_payload: {
        setting_label: settingLabel,
        href,
        action_key: CMS_SITE_MEMBER_ADD_ACTION,
        action_payload: actionPayload,
      },
      metadata: {
        cms_token: target.token,
        cms_target_id: target.id,
        cms_site_name: target.site.name,
        owning_organization_id: organizationId,
        manage_access_href: href,
      },
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const raced = await requestSummary(userId, target.site);
      if (raced?.status === "pending") {
        return NextResponse.json({
          request_id: raced.id,
          already: true,
          recipients: [],
          site_id: target.site.id,
          site_name: target.site.name,
          organization_id: target.site.organization_id,
        });
      }
    }
    throw error;
  }

  return NextResponse.json({
    request_id: data.id,
    already: false,
    recipients,
    site_id: target.site.id,
    site_name: target.site.name,
    organization_id: target.site.organization_id,
    manage_access_href: href,
    setting_key: cmsSiteAccessRequestKey(target.site.id),
    setting_label: settingLabel,
    action_key: CMS_SITE_MEMBER_ADD_ACTION,
    action_payload: actionPayload,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const token = typeof body.token === "string" ? body.token : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!isCmsAccessGateToken(token)) {
      return NextResponse.json(
        { error: "Unsupported CMS resource." },
        { status: 400 },
      );
    }

    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(anonymousPayload(token));
    }
    if (!isUuid(id)) return NextResponse.json(missingPayload(token));

    const caller = await resolveCmsCaller(mainSupabase, user.id);
    const resolved = await resolveTarget(token, id, caller);
    if (resolved.status === "not_found") {
      return NextResponse.json(missingPayload(token));
    }
    if (resolved.status === "error") {
      console.error("[cms/access-context] CMS lookup failed:", resolved.error);
      return NextResponse.json(
        { error: "We could not check this item just now.", code: "transient" },
        { status: 503 },
      );
    }

    if (body.action === "request") {
      const message =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim().slice(0, 500)
          : null;
      return createRequest(resolved.target, user.id, message);
    }

    return NextResponse.json(
      await resolvedPayload(resolved.target, caller, user.id),
    );
  } catch (error) {
    console.error("[cms/access-context] unexpected failure:", error);
    return NextResponse.json(
      { error: "We could not check this item just now.", code: "transient" },
      { status: 500 },
    );
  }
}
