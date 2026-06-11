/**
 * Orchestrator URL/key resolution for the two-tier sandbox model.
 *
 * Each sandbox is hosted on exactly one orchestrator (EC2 or hosted on the
 * Matrx dev server). The tier is captured at create time and persisted in the
 * sandbox row's `config.tier` field. Every per-sandbox proxy route (`/exec`,
 * `/fs/*`, `/git/*`, `/extend`, …) reads the row, resolves the tier, and
 * forwards to the matching orchestrator URL with the matching API key.
 *
 * This is a server-only module — never import from a Client Component.
 */

import { createClient } from "@/utils/supabase/server";
import type { SandboxConfig, SandboxTier } from "@/types/sandbox";

const LOG = "[sandbox-orchestrator-env]";

// Capture whether each var was actually provided BEFORE applying any default,
// so we can scream when a hardcoded fallback is silently masking a missing var.
const EC2_URL_PROVIDED = !!process.env.MATRX_ORCHESTRATOR_URL;
const HOSTED_URL_PROVIDED = !!process.env.MATRX_HOSTED_ORCHESTRATOR_URL;

const EC2_URL =
  process.env.MATRX_ORCHESTRATOR_URL || "http://54.144.86.132:8000";
const EC2_KEY = process.env.MATRX_ORCHESTRATOR_API_KEY || "";
const HOSTED_URL =
  process.env.MATRX_HOSTED_ORCHESTRATOR_URL ||
  "https://orchestrator.dev.codematrx.com";
const HOSTED_KEY = process.env.MATRX_HOSTED_ORCHESTRATOR_API_KEY || "";

// Boot-time scream. Runs once per server process when this module first loads.
// No silent failures: every missing sandbox env var is named here, loudly.
(function assertSandboxEnvLoudly() {
  const problems: string[] = [];
  if (!EC2_URL_PROVIDED)
    problems.push(
      `MATRX_ORCHESTRATOR_URL is MISSING — falling back to hardcoded ${EC2_URL} (a backup that can mask the real value).`,
    );
  if (!EC2_KEY)
    problems.push(
      "MATRX_ORCHESTRATOR_API_KEY is MISSING/empty — EC2 sandbox token mint will FAIL (401) and no agent will get EC2 sandbox tools.",
    );
  if (!HOSTED_URL_PROVIDED)
    problems.push(
      `MATRX_HOSTED_ORCHESTRATOR_URL is MISSING — falling back to hardcoded ${HOSTED_URL}.`,
    );
  if (!HOSTED_KEY)
    problems.push(
      "MATRX_HOSTED_ORCHESTRATOR_API_KEY is MISSING/empty — HOSTED sandbox token mint will FAIL (401).",
    );
  if (problems.length > 0) {
    console.error(
      `${LOG} ⚠️ ${problems.length} sandbox env problem(s) detected at server start:\n  - ${problems.join("\n  - ")}`,
    );
  }
})();

export interface OrchestratorTarget {
  /** Base URL, no trailing slash. */
  url: string;
  /** API key (sent as `X-API-Key`). May be empty for local dev. */
  apiKey: string;
  /** Resolved tier — either explicit or 'ec2' (back-compat default). */
  tier: SandboxTier;
}

/**
 * Resolve which orchestrator to forward a request to based on a sandbox's
 * persisted tier. Logs loudly when tier is null/undefined — every callsite
 * should resolve tier before calling this. The EC2 fallback is kept for
 * legacy rows written before the tier column existed, but the error makes
 * it visible so those rows can be backfilled.
 *
 * For new sandbox creation, tier must be passed explicitly — the creation
 * API now returns a 400 rather than silently defaulting.
 */
export function resolveOrchestratorByTier(
  tier: SandboxTier | null | undefined,
): OrchestratorTarget {
  if (tier == null) {
    console.error(
      `${LOG} ❌ resolveOrchestratorByTier called with null/undefined tier. ` +
        "A sandbox row has no tier set — was it created without an explicit tier? " +
        "Falling back to 'ec2'. Update the row or ensure tier is passed at creation time. " +
        "Stack: " +
        new Error().stack,
    );
  }
  if (tier === "hosted") {
    if (!HOSTED_KEY)
      console.error(
        `${LOG} ❌ resolving HOSTED orchestrator but MATRX_HOSTED_ORCHESTRATOR_API_KEY is empty — this request's token mint WILL fail.`,
      );
    return {
      url: HOSTED_URL.replace(/\/$/, ""),
      apiKey: HOSTED_KEY,
      tier: "hosted",
    };
  }
  if (!EC2_KEY)
    console.error(
      `${LOG} ❌ resolving EC2 orchestrator but MATRX_ORCHESTRATOR_API_KEY is empty — this request's token mint WILL fail.`,
    );
  return { url: EC2_URL.replace(/\/$/, ""), apiKey: EC2_KEY, tier: "ec2" };
}

/**
 * Look up a sandbox by its row id (the Postgres UUID, not the orchestrator's
 * `sandbox_id`), enforce ownership against the current Supabase user, and
 * resolve its orchestrator target plus the upstream `sandbox_id`.
 *
 * Returns `null` for the orchestrator field on errors so callers can build a
 * single response without a try/catch chain.
 */
export async function lookupSandboxAndOrchestrator(
  sandboxRowId: string,
): Promise<
  | {
      ok: true;
      orchestrator: OrchestratorTarget;
      sandboxId: string;
      status: string;
    }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: "User not authenticated" };
  }

  const { data, error } = await supabase
    .from("sandbox_instances")
    .select("sandbox_id, status, config, tier")
    .eq("id", sandboxRowId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    return { ok: false, status: 404, error: "Sandbox instance not found" };
  }

  // Prefer the dedicated `tier` column; fall back to `config.tier` for rows
  // written before the column existed. Unknown values land as `null` so
  // routing falls back to the EC2 default rather than corrupting traffic.
  const colTier =
    data.tier === "ec2" || data.tier === "hosted" ? data.tier : null;
  const cfg = data.config as SandboxConfig | null;
  const cfgTier =
    cfg?.tier === "ec2" || cfg?.tier === "hosted" ? cfg.tier : null;
  const tier: SandboxTier | null = colTier ?? cfgTier ?? null;

  return {
    ok: true,
    orchestrator: resolveOrchestratorByTier(tier),
    sandboxId: data.sandbox_id,
    status: data.status,
  };
}

/**
 * Build the standard headers we send to the orchestrator on JSON calls.
 * Caller can spread additional headers on top.
 */
export function orchestratorJsonHeaders(
  target: OrchestratorTarget,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (target.apiKey) headers["X-API-Key"] = target.apiKey;
  return headers;
}

/**
 * Compute the public proxy_url a browser uses to reach an in-container
 * matrx_agent daemon (and the AI Dream FastAPI when sandbox-mode is on).
 *
 * The orchestrator returns this on every fresh ``SandboxResponse``, but
 * we don't persist it to ``sandbox_instances`` (the URL is derivable from
 * the orchestrator's base + the upstream sandbox_id, so persisting would
 * just add a sync surface). This helper recomputes from the per-tier
 * ``MATRX_*_ORCHESTRATOR_URL`` env var so every list / detail / create
 * response surfaces the same URL the orchestrator's own SandboxResponse
 * carries.
 *
 * Returns ``null`` only when the matching tier's URL env var isn't set.
 */
export function buildSandboxProxyUrl(
  sandboxId: string | null | undefined,
  tier: SandboxTier | null | undefined,
): string | null {
  if (!sandboxId) return null;
  const target = resolveOrchestratorByTier(tier);
  if (!target.url) return null;
  return `${target.url}/sandboxes/${sandboxId}/proxy`;
}
