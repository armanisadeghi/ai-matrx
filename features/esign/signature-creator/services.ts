"use client";

// features/esign/signature-creator/services.ts — the creator's two server conversations:
// saved signatures (CONTRACT §3.2, §6.1 doors) and the phone page's open/submit (§4, §7).
// Nothing here decides a right; the database and aidream do.
//
// The saved-signature doors live in the `esign` schema (typed by database.types). The phone routes
// below still carry one narrow cast until the published api-types name them.

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

export interface HandoffOpenAnswer {
  ok: boolean;
  message?: string;
  target?: "signature" | "initials";
  first_name?: string;
  sender_name?: string;
  organization_name?: string;
  expires_at?: string;
  allowed?: { drawn: boolean; uploaded: boolean };
}

export interface HandoffSubmitAnswer {
  ok: boolean;
  message?: string;
}

type LooseCall = (config: Record<string, unknown>) => Parameters<AppDispatch>[0];

async function post<T>(dispatch: AppDispatch, path: string, body: Record<string, unknown>): Promise<T> {
  const call = callApi as unknown as LooseCall;
  const result = (await dispatch(
    call({ path, method: "POST", body, expectedErrorStatuses: [409, 422], organizationFreeRead: true }),
  )) as { data?: unknown; error?: { serverDetail?: unknown } | null };
  if (!result.error && result.data !== undefined) return result.data as T;
  const detail = result.error?.serverDetail as { detail?: { message?: unknown } } | undefined;
  const message = detail?.detail?.message;
  throw new Error(
    typeof message === "string" && message !== "" ? message : "We could not reach AI Matrx just now. Try again in a moment.",
  );
}

export function openHandoff(dispatch: AppDispatch, secret: string): Promise<HandoffOpenAnswer> {
  return post<HandoffOpenAnswer>(dispatch, "/esign/signing/handoff/open", { secret });
}

export function submitHandoff(
  dispatch: AppDispatch,
  input: { secret: string; method: "drawn" | "uploaded"; image_data_url: string },
): Promise<HandoffSubmitAnswer> {
  return post<HandoffSubmitAnswer>(dispatch, "/esign/signing/handoff/submit", input);
}
