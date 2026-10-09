"use client";

// features/mandates/authoring-level/service.ts
//
// Create a SOFT mandate at the user or organization level — the owner's model
// (common-docs/systems/intelligence/mandates/MANDATE-SYSTEM.md §3): system creates code-backed
// and soft mandates; an organization and a user create SOFT mandates only.
//
// One door, aidream `POST /mandates/soft` (the super-admin `POST /mandates` is
// untouched). The server decides the home and "Shown to", never the client:
//   level "user"          → homed in the caller's personal organization,
//                           Shown to: Only me (until I share it)
//   level "organization"  → homed in that organization, Shown to: the type's
//                           default (every member); refused unless the caller is an
//                           owner/admin there, and refused for the system org.
// Server refusals are shown verbatim — the server's words are the UI copy.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import { parseCallApiError } from "@/lib/api/errors";
import { OrganizationContextError } from "@/lib/api/organization-context";
import { createClient } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { invalidateMandateCache } from "@ai-matrx/chat/mandates/service";
import type { CreateMandateInput, DraftInput } from "@/features/mandates/authoring/service";
import type { MandateListLevel } from "@/features/mandates/member-list/types";
import { storedMandateKey, type AnyMandateKey } from "@ai-matrx/agents/mandates";

export interface CreateSoftMandateInput extends CreateMandateInput {
  level: MandateListLevel;
  /** Organization level: the organization the mandate belongs to. */
  organizationId?: string | null;
}

export interface CreatedSoftMandate {
  mandateKey: AnyMandateKey;
  mandateId: string;
  organizationId: string;
}

function wireDraftInputs(items: DraftInput[]) {
  return items
    .filter((item) => item.description.trim().length > 0)
    .map((item) => ({
      description: item.description.trim(),
      ...(item.name?.trim() ? { name: item.name.trim() } : {}),
      ...(item.kind?.trim() ? { kind: item.kind.trim() } : {}),
      ...(item.required !== undefined ? { required: item.required } : {}),
    }));
}

/**
 * The request body. Pure — exported for tests. The organization is NOT in the
 * body: callApi injects the request's organization, and an organization-level
 * create redirects that whole request context with `scopeOverrides` (the
 * deliberate door — a body value that disagrees with the context is refused).
 */
export function softMandateBody(input: CreateSoftMandateInput) {
  return {
    level: input.level === "organization" ? ("organization" as const) : ("user" as const),
    mandate_key: input.mandateKey.trim(),
    label: input.label.trim(),
    goal: input.goal,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.outputKind ? { output_kind: input.outputKind } : {}),
    ...(input.outputConstraints?.trim()
      ? { output_constraints: input.outputConstraints.trim() }
      : {}),
    draft_inputs: wireDraftInputs(input.draftInputs),
  };
}

export async function createSoftMandate(
  dispatch: AppDispatch,
  input: CreateSoftMandateInput,
): Promise<CreatedSoftMandate> {
  await requireAuthenticatedSupabaseSession(createClient());
  // Where the request is filed. An organization mandate names its organization. A user-level
  // mandate is homed by the server in the request's active organization, which `callApi`
  // carries itself: with none selected, the write the person pressed is HELD and they are
  // asked (the canonical organization gate), and a refusal it could not ask about is announced
  // there with the remedy. Resolving it here too would only duplicate that one path.
  const home = input.level === "organization" ? (input.organizationId ?? null) : null;
  const result = await dispatch(
    callApi({
      path: "/mandates/soft",
      method: "POST",
      body: softMandateBody(input),
      ...(home ? { scopeOverrides: { organization_id: home } } : {}),
    }),
  );
  if (result.error?.code === "organization_context_required")
    throw new OrganizationContextError("organization_context_required", result.error.message);
  // The BackendApiError itself (its message IS the server's user message), so a
  // caller can tell a 409 "key taken" from any other refusal.
  if (result.error) throw parseCallApiError(result.error);
  const data = result.data as {
    mandate_key: string;
    mandate_id: string;
    organization_id: string;
  };
  invalidateMandateCache(storedMandateKey(data.mandate_key));
  return {
    mandateKey: storedMandateKey(data.mandate_key),
    mandateId: data.mandate_id,
    organizationId: data.organization_id,
  };
}
