"use client";

// features/esign/signature-creator/services.ts — the creator's two server conversations:
// saved signatures (CONTRACT §3.2, §6.1 doors) and the phone page's open/submit (§4, §7).
// Nothing here decides a right; the database and aidream do.
//
// The saved-signature doors live in the `esign` schema (typed by database.types). The phone routes
// below are typed by the published api-types.

import { failureSentence } from "../serverFailure";
import type { components } from "@ai-matrx/agents/generated/api-types";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";

export interface SavedSignature {
  id: string;
  target: "signature" | "initials";
  kind: "typed" | "drawn" | "uploaded";
  typed_text: string | null;
  typed_style: string | null;
  image_file_id: string;
  is_default: boolean;
  label: string | null;
  created_at: string;
  /** Mock only: an inline preview so the demo needs no file store. */
  preview_url?: string;
}

const esign = supabase.schema("esign");

export interface SavedSignaturesApi {
  list(): Promise<SavedSignature[]>;
  setDefault(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const savedSignaturesApi: SavedSignaturesApi = {
  async list() {
    const { data, error } = await esign.rpc("esign_saved_signatures");
    if (error) throw new Error(error.message);
    const rows = (data as { signatures?: SavedSignature[] } | null)?.signatures;
    return Array.isArray(rows) ? rows : [];
  },
  async setDefault(id) {
    const { error } = await esign.rpc("esign_saved_signature_set_default", { p_id: id });
    if (error) throw new Error(error.message);
  },
  async remove(id) {
    const { error } = await esign.rpc("esign_saved_signature_delete", { p_id: id });
    if (error) throw new Error(error.message);
  },
};

// ── The phone page ────────────────────────────────────────────────────────────────────────

type Schemas = components["schemas"];

export type HandoffOpenAnswer = Schemas["EsignHandoffOpenAnswer"];
export type HandoffSubmitAnswer = Schemas["EsignHandoffSubmitAnswer"];

function refusal(error: { serverDetail?: unknown } | null | undefined): Error {
  const detail = error?.serverDetail as { detail?: { message?: unknown } } | undefined;
  const message = detail?.detail?.message;
  return new Error(
    typeof message === "string" && message !== "" ? message : failureSentence(error as { status?: number; serverDetail?: unknown } | null | undefined),
  );
}

export async function openHandoff(dispatch: AppDispatch, secret: string): Promise<HandoffOpenAnswer> {
  const result = await dispatch(
    callApi({
      path: "/esign/signing/handoff/open",
      method: "POST",
      body: { secret },
      expectedErrorStatuses: [409, 422],
      organizationFreeRead: true,
    }),
  );
  if (!result.error && result.data) return result.data as Schemas["EsignHandoffOpenAnswer"];
  throw refusal(result.error);
}

export async function submitHandoff(
  dispatch: AppDispatch,
  input: { secret: string; method: "drawn" | "uploaded"; image_data_url: string },
): Promise<HandoffSubmitAnswer> {
  const result = await dispatch(
    callApi({
      path: "/esign/signing/handoff/submit",
      method: "POST",
      body: input,
      expectedErrorStatuses: [409, 422],
      organizationFreeRead: true,
    }),
  );
  if (!result.error && result.data) return result.data as Schemas["EsignHandoffSubmitAnswer"];
  throw refusal(result.error);
}
