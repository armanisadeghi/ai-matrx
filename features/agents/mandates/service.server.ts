import "server-only";

/**
 * Server-side agent-mandate resolution — the SSR twin of `service.ts`'s
 * `resolveMandate`, for Server Components that must know a mandate's agent
 * before first paint (`/chat/new`, the cx-chat demo pages).
 *
 * Same doctrine as the client resolver (see service.ts): system default
 * (agent.mandate, public-visible) → the caller's OWN user binding
 * (RLS-scoped). Org bindings apply here too (2026-08-26). Floating-only —
 * a version-pinned mandate throws, because the client run path the page hands
 * off to has no version channel.
 *
 * No module cache: each request resolves fresh through the request-scoped
 * Supabase server client (two indexed single-row reads).
 *
 * A binding whose HOLDER is not an agent (`holder_type='workflow'`) throws
 * here too — such a row carries no `agent_id`, so falling through would paint
 * the system default as though nothing were bound.
 *
 * Failure posture: throws, same as the client resolver. A page that can
 * degrade (render with client-side resolution, or a documented seed) catches
 * and SCREAMS via console.error — never a silent fallback.
 */

import { createClient } from "@/utils/supabase/server";
import { isJsonObject } from "@/types/json";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { toLlmParams } from "./llm-params";
import { parseMandateContract } from "./contract";
import {
  EXECUTABLE_HOLDER_TYPES,
  holderNotExecutableMessage,
  parseBindingWave1,
  parseMandateWave1,
  type MandateBindingLayer,
} from "./provision-shapes";
import type { ResolvedMandate } from "./service";
import { mandateBindings, mandateDefinitions } from "@/lib/supabase/mandateStorage";

/** The HOLDER gate — twin of `service.ts`'s `assertExecutableHolder`; a
 * `workflow` Holder carries no `agent_id`, so without this the binding falls
 * through and SSR paints the system default as if nothing were bound. */
function assertExecutableHolder(
  mandateKey: string,
  layer: MandateBindingLayer,
  row: object,
): string {
  const { holderType } = parseBindingWave1(row);
  if (!EXECUTABLE_HOLDER_TYPES.has(holderType)) {
    const bindingId =
      typeof (row as { id?: unknown }).id === "string"
        ? (row as { id: string }).id
        : null;
    throw new Error(
      holderNotExecutableMessage(mandateKey, layer, bindingId, holderType),
    );
  }
  return holderType;
}

export async function resolveMandateServer(
  mandateKey: string,
): Promise<ResolvedMandate> {
  const supabase = await createClient();
  // `select("*")` on purpose: the wave-1 columns (provision_key, pins,
  // pinned_context) are live but ahead of the generated Row type — they ride
  // the full row and are narrowed at ingress by `parseMandateWave1`.
  const { data: mandate, error } = await mandateDefinitions(supabase)
    .select("*")
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    throw recordUnavailable({
      entity: "mandate",
      reason: "unknown",
      recordId: mandateKey,
      relation: "agent.mandate",
    });
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
  let holderType: ResolvedMandate["holderType"] = "agent";
  let configOverrides: ResolvedMandate["configOverrides"] = null;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  // THE ORG LAYER — same walk as the client twin (system → org → user; user
  // wins). This twin skipped org too; both halves changed 2026-08-26.
  if (userId) {
    const { data: orgBindings, error: orgError } = await mandateBindings(supabase)
      .select(
        "id, holder_type, agent_id, agent_version_id, use_latest, config_overrides, is_enabled, updated_at",
      )
      .eq("mandate_id", mandate.id)
      .eq("principal_type", "org")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (orgError) throw orgError;
    const orgBinding = (orgBindings ?? []).find((b) => b.is_enabled) ?? null;
    if (orgBinding) {
      holderType = assertExecutableHolder(mandateKey, "organization", orgBinding);
      if (orgBinding.agent_version_id) {
        throw new Error(
          `mandate "${mandateKey}": an organization binding is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (isJsonObject(orgBinding.config_overrides)) {
        configOverrides = toLlmParams(orgBinding.config_overrides);
      }
      if (orgBinding.agent_id) {
        agentId = orgBinding.agent_id;
        provenance = "org";
      }
    }
  }

  if (userId) {
    const { data: binding, error: bindingError } = await mandateBindings(supabase)
      .select(
        "id, holder_type, agent_id, agent_version_id, use_latest, config_overrides, is_enabled",
      )
      .eq("mandate_id", mandate.id)
      .eq("principal_type", "user")
      .eq("subject_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bindingError) throw bindingError;
    if (binding?.is_enabled) {
      holderType = assertExecutableHolder(mandateKey, "user", binding);
      if (binding.agent_version_id) {
        throw new Error(
          `mandate "${mandateKey}": your override is version-pinned — client-run mandates must be floating; update the binding`,
        );
      }
      if (isJsonObject(binding.config_overrides)) {
        // User wins per key over the org layer (server rule).
        configOverrides = {
          ...configOverrides,
          ...toLlmParams(binding.config_overrides),
        };
      }
      if (binding.agent_id) {
        agentId = binding.agent_id;
        provenance = "user";
      }
    }
  }

  const wave1 = parseMandateWave1(mandate);
  return {
    mandateKey,
    mandateId: mandate.id,
    agentId,
    holderType,
    configOverrides,
    provenance,
    // The same contract the client resolver carries — required variables are a
    // RUN-time precondition on the caller, not only a bind-time check on the
    // agent (disease D4).
    contract: parseMandateContract(mandate.contract),
    inputKind: mandate.input_kind,
    outputKind: mandate.output_kind,
    provisionKey: wave1.provisionKey,
    pins: wave1.pins,
    pinnedContext: wave1.pinnedContext,
  };
}
