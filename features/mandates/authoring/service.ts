"use client";

// features/mandates/authoring/service.ts
//
// The three user-authoring doors (aidream, 2026-08-29):
//   POST  /mandates                       — create (origin='user', grounding 'H')
//   PATCH /mandates/{key}/goal            — set goal on ANY mandate → grounding 'H'
//   PATCH /mandates/{key}/draft-inputs    — descriptive pre-code inputs
//
// The goal lives ONLY on `mandate.definition.goal` (post-1W). The boot sync
// refreshes goals only over grounding 'A', so an 'H' edit made here is
// permanent platform-wide. Server errors (the key validator's message, the
// duplicate-key 409) are surfaced verbatim — the server's words are the UI copy.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import { parseCallApiError } from "@/lib/api/errors";
import { invalidateMandateCache } from "../service";

/** One descriptive input: description is the only required field. */
export interface DraftInput {
  name?: string;
  description: string;
  kind?: string;
  required?: boolean;
  /**
   * D2 — ONE EXAMPLE of what this input's value looks like. It rides onto the
   * job's OFFER (`offer_for` → `described_offered_values`), which is what makes
   * it visible on the binding screen at the moment somebody decides where this
   * value should land (UI-STANDARD P5).
   *
   * An illustration, never a default: nothing reads it at run time on either
   * side of the wire, so it can never become an answer.
   */
  example?: string;
}

export interface CreateMandateInput {
  mandateKey: string;
  label: string;
  goal: string;
  description?: string;
  outputKind?: string | null;
  /** Free-text constraints line ("markdown text, max 200 words"). */
  outputConstraints?: string;
  draftInputs: DraftInput[];
}

export interface CreatedMandate {
  mandateKey: string;
  mandateId: string;
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

export async function createMandate(
  dispatch: AppDispatch,
  input: CreateMandateInput,
): Promise<CreatedMandate> {
  const result = await dispatch(
    callApi({
      path: "/mandates",
      method: "POST",
      body: {
        mandate_key: input.mandateKey.trim(),
        label: input.label.trim(),
        goal: input.goal,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.outputKind ? { output_kind: input.outputKind } : {}),
        ...(input.outputConstraints?.trim()
          ? { output_constraints: input.outputConstraints.trim() }
          : {}),
        draft_inputs: wireDraftInputs(input.draftInputs),
      },
    }),
  );
  if (result.error) throw new Error(parseCallApiError(result.error).userMessage);
  const data = result.data as { mandate_key: string; mandate_id: string };
  return { mandateKey: data.mandate_key, mandateId: data.mandate_id };
}

/** Set the goal (any mandate). The row's grounding becomes 'H'. */
export async function patchMandateGoal(
  dispatch: AppDispatch,
  mandateKey: string,
  goal: string,
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/goal",
      method: "PATCH",
      pathParams: { mandate_key: mandateKey },
      body: { goal },
    }),
  );
  if (result.error) throw new Error(parseCallApiError(result.error).userMessage);
  invalidateMandateCache(mandateKey);
}

/** Replace the mandate's descriptive input list. */
export async function patchMandateDraftInputs(
  dispatch: AppDispatch,
  mandateKey: string,
  draftInputs: DraftInput[],
): Promise<void> {
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/draft-inputs",
      method: "PATCH",
      pathParams: { mandate_key: mandateKey },
      body: { draft_inputs: wireDraftInputs(draftInputs) },
    }),
  );
  if (result.error) throw new Error(parseCallApiError(result.error).userMessage);
  invalidateMandateCache(mandateKey);
}

/** The row's draft_inputs jsonb, parsed defensively. */
export function parseDraftInputs(raw: unknown): DraftInput[] {
  if (!Array.isArray(raw)) return [];
  const items: DraftInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.description !== "string" || !record.description.trim()) continue;
    items.push({
      description: record.description,
      ...(typeof record.name === "string" && record.name ? { name: record.name } : {}),
      ...(typeof record.kind === "string" && record.kind ? { kind: record.kind } : {}),
      ...(typeof record.required === "boolean" ? { required: record.required } : {}),
      ...(typeof record.example === "string" && record.example
        ? { example: record.example }
        : {}),
    });
  }
  return items;
}
