import "server-only";

/**
 * Server-side agent-mandate resolution — the SSR twin of `service.ts`'s
 * `resolveMandate`, for Server Components that must know a mandate's agent
 * before first paint (`/chat/new`, the cx-chat demo pages).
 *
 * Same doctrine as the client resolver (see service.ts): system default
 * (agent.mandate, public-visible) → the caller's OWN user binding
 * (RLS-scoped). Org bindings stay server-of-aidream business. Floating-only —
 * a version-pinned mandate throws, because the client run path the page hands
 * off to has no version channel.
 *
 * No module cache: each request resolves fresh through the request-scoped
 * Supabase server client (two indexed single-row reads).
 *
 * Failure posture: throws, same as the client resolver. A page that can
 * degrade (render with client-side resolution, or a documented seed) catches
 * and SCREAMS via console.error — never a silent fallback.
 */

import { createClient } from "@/utils/supabase/server";
import { isJsonObject } from "@/types/json";
import { toLlmParams } from "./llm-params";
import { parseMandateContract } from "./contract";
import type { ResolvedMandate } from "./service";

export async function resolveMandateServer(
  mandateKey: string,
): Promise<ResolvedMandate> {
  const supabase = await createClient();
  const { data: mandate, error } = await supabase
    .schema("agent")
    .from("mandate")
    .select(
      "id, mandate_key, default_agent_id, default_agent_version_id, use_latest, is_enabled, contract",
    )
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw new Error(
      `mandate "${mandateKey}" not found — it must be declared server-side and seeded (see mandates FEATURE.md)`,
    );
  }
  if (!mandate.is_enabled) {
    throw new Error(`mandate "${mandateKey}" is disabled`);
  }
  if (!mandate.use_latest || !mandate.default_agent_id) {
    throw new Error(
      `mandate "${mandateKey}" is version-pinned — client-run mandates must be floating (use_latest); route this consumer through the server, or rebind`,
    );
  }

  let agentId = mandate.default_agent_id;
  let provenance: ResolvedMandate["provenance"] = "system";
  let configOverrides: ResolvedMandate["configOverrides"] = null;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId) {
    const { data: binding, error: bindingError } = await supabase
      .schema("agent")
      .from("mandate_binding")
      .select("agent_id, agent_version_id, use_latest, config_overrides, is_enabled")
      .eq("mandate_id", mandate.id)
      .eq("principal_type", "user")
      .eq("subject_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bindingError) throw bindingError;
    if (binding?.is_enabled) {
      if (binding.agent_version_id) {
        throw new Error(
          `mandate "${mandateKey}": your override is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (isJsonObject(binding.config_overrides)) {
        configOverrides = toLlmParams(binding.config_overrides);
      }
      if (binding.agent_id) {
        agentId = binding.agent_id;
        provenance = "user";
      }
    }
  }

  return {
    mandateKey,
    agentId,
    configOverrides,
    provenance,
    // The same contract the client resolver carries — required variables are a
    // RUN-time precondition on the caller, not only a bind-time check on the
    // agent (disease D4).
    contract: parseMandateContract(mandate.contract),
  };
}
