import "server-only";

/**
 * Server-side agent-slot resolution — the SSR twin of `service.ts`'s
 * `resolveAgentSlot`, for Server Components that must know a slot's agent
 * before first paint (`/chat/new`, the cx-chat demo pages).
 *
 * Same doctrine as the client resolver (see service.ts): system default
 * (agent.slot_definition, public-visible) → the caller's OWN user binding
 * (RLS-scoped). Org bindings stay server-of-aidream business. Floating-only —
 * a version-pinned slot throws, because the client run path the page hands
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
import type { ResolvedClientSlot } from "./service";

export async function resolveAgentSlotServer(
  slotKey: string,
): Promise<ResolvedClientSlot> {
  const supabase = await createClient();
  const { data: slot, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .select(
      "id, slot_key, default_agent_id, default_agent_version_id, use_latest, is_enabled",
    )
    .eq("slot_key", slotKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!slot) {
    throw new Error(
      `agent slot "${slotKey}" not found — it must be declared server-side and seeded (see agent-slots FEATURE.md)`,
    );
  }
  if (!slot.is_enabled) {
    throw new Error(`agent slot "${slotKey}" is disabled`);
  }
  if (!slot.use_latest || !slot.default_agent_id) {
    throw new Error(
      `agent slot "${slotKey}" is version-pinned — client-run slots must be floating (use_latest); route this consumer through the server, or repin`,
    );
  }

  let agentId = slot.default_agent_id;
  let provenance: ResolvedClientSlot["provenance"] = "system";
  let configOverrides: ResolvedClientSlot["configOverrides"] = null;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId) {
    const { data: binding, error: bindingError } = await supabase
      .schema("agent")
      .from("slot_binding")
      .select("agent_id, agent_version_id, use_latest, config_overrides, is_enabled")
      .eq("slot_id", slot.id)
      .eq("principal_type", "user")
      .eq("subject_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bindingError) throw bindingError;
    if (binding?.is_enabled) {
      if (binding.agent_version_id) {
        throw new Error(
          `agent slot "${slotKey}": your override is version-pinned — client-run slots must be floating; update the binding`,
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

  return { slotKey, agentId, configOverrides, provenance };
}
