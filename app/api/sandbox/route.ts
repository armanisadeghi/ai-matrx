import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  resolveOrchestratorByTier,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { decorateSandboxRow } from "@/lib/sandbox/decorate-sandbox-row";
import { reconcileUserSandboxes } from "@/lib/sandbox/reconcile";
import type { SandboxConfig, SandboxTier } from "@/types/sandbox";
import type { Database } from "@/types/database.types";

type SandboxInstanceInsert =
  Database["public"]["Tables"]["sandbox_instances"]["Insert"];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const status = searchParams.get("status");
    const tier = searchParams.get("tier");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const includeDeleted = searchParams.get("include_deleted") === "true";

    let query = supabase
      .from("sandbox_instances")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching sandbox instances:", error);
      return NextResponse.json(
        { error: "Failed to fetch sandbox instances", details: error.message },
        { status: 500 },
      );
    }

    // Optional client-side tier filter — we store tier in `config` (JSONB)
    // until we promote it to a column, so a SQL-side filter would need a
    // JSON path operator. Filtering in JS is fine for the modest list size.
    let instances = data || [];
    if (tier) {
      instances = instances.filter(
        (row) => (row.config as SandboxConfig | null)?.tier === tier,
      );
    }

    return NextResponse.json({
      instances: instances.map(decorateSandboxRow),
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Sandbox list API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      project_id,
      config,
      ttl_seconds,
      tier: tierInput,
      template,
      template_version,
      resources,
      labels,
    } = body as {
      project_id?: string;
      config?: SandboxConfig;
      ttl_seconds?: number;
      tier?: SandboxTier;
      template?: string;
      template_version?: string;
      resources?: { cpu?: number; memory_mb?: number; disk_mb?: number };
      labels?: Record<string, string>;
    };

    if (project_id) {
      const { data: project, error: projectError } = await supabase
        .from("ctx_projects")
        .select("id")
        .eq("id", project_id)
        .single();

      if (projectError || !project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }
    }

    const ACTIVE_STATUSES = ["creating", "starting", "ready", "running"];
    const ACTIVE_LIMIT = 5;

    const countActive = async () => {
      const { data, error } = await supabase
        .from("sandbox_instances")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .in("status", ACTIVE_STATUSES)
        .is("deleted_at", null);
      return { data, error };
    };

    let { data: activeInstances, error: countError } = await countActive();

    // Self-heal: if we're at the limit, ask each orchestrator whether the
    // sandboxes the rows reference actually still exist. Rows whose
    // containers are gone get marked destroyed so they free their slot.
    // This catches the common case where an in-memory orchestrator restart
    // (or an out-of-band container destroy) leaves Supabase rows stranded
    // in 'ready'/'running' forever.
    if (
      !countError &&
      activeInstances &&
      activeInstances.length >= ACTIVE_LIMIT
    ) {
      const summary = await reconcileUserSandboxes(user.id);
      if (summary.reconciled > 0) {
        ({ data: activeInstances, error: countError } = await countActive());
      }
    }

    if (
      !countError &&
      activeInstances &&
      activeInstances.length >= ACTIVE_LIMIT
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum active sandbox limit reached (5). Stop an existing sandbox first.",
        },
        { status: 429 },
      );
    }

    // Resolve tier — explicit > config.tier > default 'ec2' for back-compat.
    const tier: SandboxTier =
      tierInput || (config?.tier as SandboxTier) || "ec2";
    const target = resolveOrchestratorByTier(tier);

    // Merge the user's vaulted secrets into config.env before forwarding.
    // aidream owns the decryption (Fernet key lives there); we authenticate
    // with the user's Supabase JWT so RLS still pins to this user. Any
    // failure here is non-fatal — the sandbox still creates, just without
    // auto-injected secrets — so a temporary aidream blip doesn't break
    // sandbox creation.
    //
    // Doctrine note: per CLAUDE.md, Next.js API routes should NOT sit
    // between React and Python. This route already exists as the
    // orchestrator-forwarding shim (per-user sandbox-quota check +
    // project validation + reconcile happen here in Supabase before
    // forwarding), so we're not adding a NEW middle tier — just one
    // extra outbound fetch on a path that already brokers between
    // clients and Python. If this route is ever refactored to live in
    // aidream, the secrets-injection step moves with it; until then,
    // this is the smallest possible patch that gets the vault wired up.
    //
    // Merge precedence: vault secrets WIN over caller-supplied
    // config.env. That's intentional — the user spec is "set once,
    // never lose it". If a caller passes a stale value for a key the
    // user has rotated in the vault, the rotated value wins.
    const mergedConfig: SandboxConfig = { ...(config || {}) };
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const aidreamUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com";
        const envResp = await fetch(`${aidreamUrl}/api/user-secrets/sandbox-env`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        });
        if (envResp.ok) {
          const body = (await envResp.json()) as {
            env: Record<string, string>;
            count: number;
          };
          const existingEnv =
            (mergedConfig as { env?: Record<string, string> }).env || {};
          (mergedConfig as { env?: Record<string, string> }).env = {
            ...existingEnv,
            ...body.env,
          };
        } else {
          console.warn(
            `[sandbox-create] secrets fetch failed (${envResp.status}); continuing without auto-injected secrets`,
          );
        }
      }
    } catch (secretsErr) {
      console.warn(
        "[sandbox-create] secrets fetch threw; continuing without auto-injection:",
        secretsErr,
      );
    }

    // Forward to the matching orchestrator.
    const orchestratorBody: Record<string, unknown> = {
      user_id: user.id,
      config: mergedConfig,
      tier,
    };
    if (template) orchestratorBody.template = template;
    if (template_version) orchestratorBody.template_version = template_version;
    if (resources) orchestratorBody.resources = resources;
    if (labels) orchestratorBody.labels = labels;
    if (ttl_seconds) orchestratorBody.ttl_seconds = ttl_seconds;

    let orchestratorResp: Response;
    try {
      orchestratorResp = await fetch(`${target.url}/sandboxes`, {
        method: "POST",
        headers: orchestratorJsonHeaders(target),
        body: JSON.stringify(orchestratorBody),
      });
    } catch (fetchError) {
      console.error(`Orchestrator (${tier}) connection failed:`, fetchError);
      return NextResponse.json(
        {
          error: `Sandbox orchestrator (${tier}) is not reachable. Ensure the orchestrator service is running.`,
        },
        { status: 502 },
      );
    }

    if (!orchestratorResp.ok) {
      const errBody = await orchestratorResp.text();
      // The 403 + "Invalid API key" path is the most common production
      // misconfiguration — flag it loudly so the env-var fix is obvious
      // in the deploy logs without needing to grep for it.
      const looksLikeAuthFailure =
        orchestratorResp.status === 401 ||
        orchestratorResp.status === 403 ||
        /api[-_ ]?key/i.test(errBody);
      console.error(
        `Orchestrator create (${tier}) failed:`,
        orchestratorResp.status,
        errBody,
        looksLikeAuthFailure
          ? `\n  → likely missing/incorrect ${
              tier === "hosted"
                ? "MATRX_HOSTED_ORCHESTRATOR_API_KEY"
                : "MATRX_ORCHESTRATOR_API_KEY"
            } env var on this deployment`
          : "",
      );
      return NextResponse.json(
        { error: "Failed to create sandbox container", details: errBody },
        {
          status:
            orchestratorResp.status === 400
              ? 400
              : orchestratorResp.status === 401 ||
                  orchestratorResp.status === 403
                ? orchestratorResp.status
                : 502,
        },
      );
    }

    const orchestratorData = await orchestratorResp.json();
    const effectiveTtl = ttl_seconds || orchestratorData?.ttl_seconds || 7200;

    // `tier`, `template`, `template_version`, and `labels` are now dedicated
    // top-level columns on `sandbox_instances` (Supabase migration landed).
    // We still mirror them into `config` JSONB so legacy code paths that read
    // `config.tier` (e.g. orchestrator-routing pre-migration callers) keep
    // working — the helper in `decorate-sandbox-row.ts` prefers the column
    // and falls back to `config` for old rows.
    const persistedConfig: SandboxConfig = {
      ...(config || {}),
      tier,
      ...(template ? { template } : {}),
      ...(template_version ? { template_version } : {}),
      ...(resources ? { resources } : {}),
      ...(labels ? { labels } : {}),
    };

    // Typed against the DB Insert shape: if Supabase types regenerate with a
    // renamed/required column, this assignment fails at compile time. That's
    // the contract that catches the next `proxy_url`-style silent drop.
    const sandboxRecord: SandboxInstanceInsert = {
      user_id: user.id,
      project_id: project_id || null,
      sandbox_id: orchestratorData.sandbox_id,
      status: orchestratorData.status,
      container_id: orchestratorData.container_id,
      hot_path: orchestratorData.hot_path || "/home/agent",
      cold_path: orchestratorData.cold_path || "/data/cold",
      config: persistedConfig,
      tier,
      template: template ?? null,
      template_version: template_version ?? null,
      labels: labels ?? null,
      ttl_seconds: effectiveTtl,
      expires_at:
        orchestratorData.expires_at ||
        new Date(Date.now() + effectiveTtl * 1000).toISOString(),
    };

    const { data: instance, error: insertError } = await supabase
      .from("sandbox_instances")
      .upsert(sandboxRecord, { onConflict: "sandbox_id" })
      .select()
      .single();

    if (insertError) {
      console.error("Error saving sandbox instance:", insertError);
      return NextResponse.json(
        {
          error: "Sandbox created but failed to save record",
          details: insertError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { instance: decorateSandboxRow(instance) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Sandbox create API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
