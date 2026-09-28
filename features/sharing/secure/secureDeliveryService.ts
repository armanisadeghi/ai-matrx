"use client";

// features/sharing/secure/secureDeliveryService.ts — SECURE DELIVERY, the client half.
//
// A person sends ONE item (and, optionally, protected fields such as a vault password or an SSN)
// to ONE recipient who needs no account: a single-use link on one channel, a code on the other,
// shown once. The server (aidream `services/secure_delivery`, FEATURE.md there) seals the payload
// on the sender's authority and the database hands it out exactly once — this file decides
// NOTHING. It carries requests to aidream through `callApi` (so the transport, auth and the
// selected server are the app's one path) and reads the sender's own list straight from
// the door `platform.secure_delivery_sent` (the caller's own rows only; the table is closed to clients).
//
// 🚨 NO VALUE EVER PASSES THROUGH THE SENDER'S SIDE. `create` returns a receipt; the link secret
// goes to the recipient only; the payload column is client-excluded in the database.

import { callApi } from "@/lib/api/call-api";
import type { ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import { createClient } from "@/utils/supabase/client";

export type SecureDeliveryOptions = components["schemas"]["OptionsResponse"];
export type SecureDeliveryReceipt = components["schemas"]["CreateResponse"];
export type SecureDeliveryPage = components["schemas"]["RecipientPage"];
export type SecureDeliveryCreate = components["schemas"]["CreateBody"];

/** A refusal the server named, with the remedy it offered. */
export class SecureDeliveryRefusal extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly remedy: string | null,
  ) {
    super(message);
    this.name = "SecureDeliveryRefusal";
  }
}

function refusalFrom(result: ApiCallResult): SecureDeliveryRefusal {
  const detail = result.error?.serverDetail as
    | { detail?: { code?: string; message?: string; remedy?: string | null } }
    | { code?: string; message?: string; remedy?: string | null }
    | undefined;
  const inner =
    detail && typeof detail === "object" && "detail" in detail && detail.detail
      ? detail.detail
      : (detail as { code?: string; message?: string; remedy?: string | null } | undefined);
  return new SecureDeliveryRefusal(
    inner?.message ?? result.error?.message ?? "The secure link could not be sent.",
    inner?.code ?? result.error?.type ?? "unknown",
    inner?.remedy ?? null,
  );
}

function read<T>(result: ApiCallResult): T {
  if (result.error || result.data === undefined) throw refusalFrom(result);
  return result.data as T;
}

// ─── sender ───────────────────────────────────────────────────────────────────
export async function fetchSecureDeliveryOptions(
  dispatch: AppDispatch,
  resourceType: string,
  resourceId: string,
): Promise<SecureDeliveryOptions> {
  return read<SecureDeliveryOptions>(
    await dispatch(
      callApi({
        path: "/secure-delivery/options",
        method: "GET",
        queryParams: { resource_type: resourceType, resource_id: resourceId },
        expectedErrorStatuses: [401, 409, 422],
      }),
    ),
  );
}

export async function sendSecureDelivery(
  dispatch: AppDispatch,
  body: Omit<SecureDeliveryCreate, "organization_id" | "project_id" | "task_id">,
): Promise<SecureDeliveryReceipt> {
  return read<SecureDeliveryReceipt>(
    await dispatch(
      callApi({
        path: "/secure-delivery",
        method: "POST",
        body,
        expectedErrorStatuses: [401, 409, 422],
      }),
    ),
  );
}

export async function revokeSecureDelivery(
  dispatch: AppDispatch,
  deliveryId: string,
): Promise<string> {
  const receipt = read<{ sentence: string }>(
    await dispatch(
      callApi({
        path: "/secure-delivery/{delivery_id}/revoke",
        method: "POST",
        pathParams: { delivery_id: deliveryId },
        body: {},
        expectedErrorStatuses: [401, 409],
      }),
    ),
  );
  return receipt.sentence;
}

/** One delivery the signed-in person sent for one record. Addresses are theirs to see. */
export interface SentSecureDelivery {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  link_channel: string;
  code_channel: string;
  field_keys: string[];
  status: string;
  created_at: string;
  expires_at: string;
  viewed_at: string | null;
}

export async function listSentSecureDeliveries(
  resourceType: string,
  resourceId: string,
): Promise<SentSecureDelivery[]> {
  // The delivery table is closed to signed-in clients (aidream 1350g): the list comes from the
  // door that returns only the CALLER's own sent rows for this item — never a coworker's.
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .rpc("secure_delivery_sent", { p_resource_type: resourceType, p_resource_id: resourceId });
  if (error) throw new Error(error.message);
  return (data ?? []) as SentSecureDelivery[];
}

// ─── recipient — no sign-in ──────────────────────────────────────────────────
async function recipientCall(
  dispatch: AppDispatch,
  path: "/secure-delivery/open" | "/secure-delivery/code",
  token: string,
): Promise<SecureDeliveryPage> {
  return read<SecureDeliveryPage>(
    await dispatch(
      callApi({
        path,
        method: "POST",
        body: { token },
        expectedErrorStatuses: [422],
        // The recipient belongs to no organization (aidream declares these routes
        // `organization_free`): a visitor who happens to be signed in with none picked
        // must never be asked to choose one to open a link somebody sent them.
        organizationFreeRead: true,
      }),
    ),
  );
}

export const openSecureDelivery = (dispatch: AppDispatch, token: string) =>
  recipientCall(dispatch, "/secure-delivery/open", token);

export const requestSecureDeliveryCode = (dispatch: AppDispatch, token: string) =>
  recipientCall(dispatch, "/secure-delivery/code", token);

export async function viewSecureDelivery(
  dispatch: AppDispatch,
  token: string,
  code: string,
): Promise<SecureDeliveryPage> {
  return read<SecureDeliveryPage>(
    await dispatch(
      callApi({
        path: "/secure-delivery/view",
        method: "POST",
        body: { token, code },
        expectedErrorStatuses: [422],
        organizationFreeRead: true,
      }),
    ),
  );
}
