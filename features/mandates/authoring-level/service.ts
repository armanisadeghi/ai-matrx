"use client";

// features/mandates/authoring-level/service.ts
//
// Create a SOFT mandate at the user or organization level — the owner's model
// (common-docs/systems/intelligence/mandates/MANDATE-SYSTEM.md §3): system creates code-backed
// and soft mandates; an organization and a user create SOFT mandates only.
//
// One door, aidream `POST /mandates/soft` (the super-admin `POST /mandates` is
// untouched). The server decides the home and the visibility, never the client:
//   level "user"          → homed in the caller's personal organization,
//                           visibility personal (only me until I share it)
//   level "organization"  → homed in that organization, visibility internal
//                           (every member); refused unless the caller is an
//                           owner/admin there, and refused for the system org.
// Server refusals are shown verbatim — the server's words are the UI copy.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import { parseCallApiError } from "@/lib/api/errors";
import { createClient } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { invalidateMandateCache } from "@/features/mandates/service";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import type { CreateMandateInput, DraftInput } from "@/features/mandates/authoring/service";
import type { MandateListLevel } from "@/features/mandates/member-list/types";

export interface CreateSoftMandateInput extends CreateMandateInput {
  level: MandateListLevel;
  /** Organization level: the organization the mandate belongs to. */
  organizationId?: string | null;
}

export interface CreatedSoftMandate {
  mandateKey: string;
  mandateId: string;
  organizationId: string;
  visibility: string;
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
  // Where the request is filed. An organization mandate names its organization. A personal
  // mandate is filed BY NAME in the person's own workspace (the server homes it there anyway) —
  // a personal create never stops at "Select an organization" (the same rule as a personal
  // binding and a personal copy, 308e1badb7).
  const home =
    input.level === "organization" ? (input.organizationId ?? null) : await resolvePersonalOrgId();
  const result = await dispatch(
    callApi({
      path: "/mandates/soft",
      method: "POST",
      body: softMandateBody(input),
      ...(home ? { scopeOverrides: { organization_id: home } } : {}),
    }),
  );
  // The BackendApiError itself (its message IS the server's user message), so a
  // caller can tell a 409 "key taken" from any other refusal.
  if (result.error) throw parseCallApiError(result.error);
  const data = result.data as {
    mandate_key: string;
    mandate_id: string;
    organization_id: string;
    visibility: string;
  };
  invalidateMandateCache(data.mandate_key);
  return {
    mandateKey: data.mandate_key,
    mandateId: data.mandate_id,
    organizationId: data.organization_id,
    visibility: data.visibility,
  };
}
