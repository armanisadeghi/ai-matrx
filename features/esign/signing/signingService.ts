"use client";

// features/esign/signing/signingService.ts — THE SIGNING SURFACE, the client half.
//
// SPEC-ESIGN §6.0 (U-03): one surface, two doors. A platform user signs their own envelope at
// `/sign/e/<envelope>`; an outsider signs at `/x/sign#t=<secret>` after a one-time code. The
// database decides everything (§4.3's five conditions, the outsider scope, the IP pin); aidream's
// `/esign/signing/*` (services/esign/signing.py) adds what a browser cannot do — send the code,
// record the signer's true address, hand over the frozen bytes. This file decides NOTHING: it
// carries requests through `callApi`, the app's one transport.

import { callApi } from "@/lib/api/call-api";
import type { ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@ai-matrx/agents/generated/api-types";

export type SigningAnswer = components["schemas"]["EsignSigningAnswer"];
export type SigningArgs = components["schemas"]["EsignActArgs"];
export type SigningAction = components["schemas"]["EsignInternalActBody"]["action"];
export type OutsiderOpenAnswer = components["schemas"]["EsignOutsiderOpenAnswer"];
export type OutsiderCodeAnswer = components["schemas"]["EsignOutsiderCodeAnswer"];
export type OutsiderVerifyAnswer = components["schemas"]["EsignOutsiderVerifyAnswer"];

/** Which door a signer came through: their own session, or a verified outsider session. */
export type SigningDoor =
  | { kind: "envelope"; envelopeId: string }
  | { kind: "outsider"; session: string };

/** The server answered and refused, with the sentence the signer reads. */
export class SigningRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningRefusal";
  }
}

/** The transport failed — the server never answered. Distinct from a refusal it answered. */
export class SigningUnreachable extends Error {
  constructor() {
    super("We could not reach AI Matrx just now. Try again in a moment.");
    this.name = "SigningUnreachable";
  }
}

function read<T>(result: ApiCallResult): T {
  if (!result.error && result.data !== undefined) return result.data as T;
  // aidream answers a refusal as 409 `{detail: {code, message}}` (routers/esign_signing.py).
  const detail = result.error?.serverDetail as { detail?: { message?: unknown } } | undefined;
  const message = detail?.detail?.message;
  if (typeof message === "string" && message !== "") throw new SigningRefusal(message);
  throw new SigningUnreachable();
}

export async function signingAct(
  dispatch: AppDispatch,
  door: SigningDoor,
  action: SigningAction,
  args: Omit<SigningArgs, "organization_id" | "project_id" | "task_id"> = {},
): Promise<SigningAnswer> {
  if (door.kind === "envelope") {
    return read<SigningAnswer>(
      await dispatch(
        callApi({
          path: "/esign/signing/envelope/{envelope_id}/act",
          method: "POST",
          pathParams: { envelope_id: door.envelopeId },
          body: { action, args },
          expectedErrorStatuses: [409, 422],
          // A signer acts on the envelope's organization, read from the envelope — never asked
          // to pick one of their own first.
          organizationFreeRead: true,
        }),
      ),
    );
  }
  return read<SigningAnswer>(
    await dispatch(
      callApi({
        path: "/esign/signing/outsider/act",
        method: "POST",
        body: { session: door.session, action, args },
        expectedErrorStatuses: [409, 422],
        organizationFreeRead: true,
      }),
    ),
  );
}

export async function openOutsiderLink(dispatch: AppDispatch, token: string): Promise<OutsiderOpenAnswer> {
  return read<OutsiderOpenAnswer>(
    await dispatch(
      callApi({
        path: "/esign/signing/outsider/open",
        method: "POST",
        body: { token },
        expectedErrorStatuses: [422],
        organizationFreeRead: true,
      }),
    ),
  );
}

export async function sendOutsiderCode(dispatch: AppDispatch, token: string): Promise<OutsiderCodeAnswer> {
  return read<OutsiderCodeAnswer>(
    await dispatch(
      callApi({
        path: "/esign/signing/outsider/code",
        method: "POST",
        body: { token },
        expectedErrorStatuses: [422],
        organizationFreeRead: true,
      }),
    ),
  );
}

export async function verifyOutsiderCode(
  dispatch: AppDispatch,
  token: string,
  code: string | null,
): Promise<OutsiderVerifyAnswer> {
  return read<OutsiderVerifyAnswer>(
    await dispatch(
      callApi({
        path: "/esign/signing/outsider/verify",
        method: "POST",
        body: { token, code },
        expectedErrorStatuses: [422],
        organizationFreeRead: true,
      }),
    ),
  );
}
