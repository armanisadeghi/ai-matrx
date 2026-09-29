"use client";

/**
 * Approve one browser for password filling with the person's account passkey
 * (access ladder T-30c).
 *
 * There is ONE WebAuthn stack: the auth server's passkeys (the same ones
 * `supabase.auth.signInWithPasskey()` uses; relying party `aimatrx.com`). This
 * file only runs the browser half of one ceremony: it asks the auth server for a
 * challenge, has the browser's authenticator sign it, and hands the signed
 * assertion to aidream, which gives it to the auth server's verifier. The
 * assertion is never sent to the auth server from here, so no new sign-in is
 * created in this tab.
 */
import { supabase } from "@/utils/supabase/client";

import { approveVaultFillDeviceWithPasskey } from "./vault-service";

/** The passkey relying party. A passkey ceremony only works on this domain. */
export const PASSKEY_RP_ID = "aimatrx.com";

export function passkeysWorkHere(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    (host === PASSKEY_RP_ID || host.endsWith(`.${PASSKEY_RP_ID}`)) &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

function fromB64url(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toB64url(buffer: ArrayBuffer | null | undefined): string | undefined {
  if (!buffer) return undefined;
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface RequestOptionsJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: {
    id: string;
    type: "public-key";
    transports?: string[];
  }[];
}

function requestOptions(
  json: RequestOptionsJSON,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: fromB64url(json.challenge),
    rpId: json.rpId,
    timeout: json.timeout,
    userVerification: json.userVerification ?? "required",
    allowCredentials: json.allowCredentials?.map((c) => ({
      id: fromB64url(c.id),
      type: c.type,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };
}

function serialize(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
      userHandle: toB64url(response.userHandle),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

/** Run one passkey ceremony and approve the browser key with that thumbprint. */
export async function approveBrowserWithPasskey(params: {
  keyThumbprint: string;
  label: string | null;
  deviceKind?: "browser" | "mac" | null;
}): Promise<{ expiresAt: string }> {
  const { data, error } = await supabase.auth.passkey.startAuthentication();
  if (error || !data) {
    throw new Error(
      "Your passkey could not be started right now. Try again in a moment.",
    );
  }
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: requestOptions(data.options as unknown as RequestOptionsJSON),
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    throw new Error(
      name === "NotAllowedError"
        ? "The passkey prompt was closed before it finished. Try again when you are ready."
        : "Your passkey could not be used here. Try again, or use the passkey you added to this account.",
    );
  }
  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("No passkey was chosen, so this browser was not approved.");
  }
  const result = await approveVaultFillDeviceWithPasskey({
    keyThumbprint: params.keyThumbprint,
    label: params.label,
    deviceKind: params.deviceKind,
    challengeId: data.challenge_id,
    credential: serialize(credential),
  });
  return { expiresAt: result.expires_at };
}

/** Add a passkey to the signed-in account (the auth server's own ceremony). */
export async function addAccountPasskey(): Promise<void> {
  const { error } = await supabase.auth.registerPasskey();
  if (error) {
    throw new Error(
      error.message?.toLowerCase().includes("abort") ||
        error.message?.toLowerCase().includes("notallowed")
        ? "The passkey prompt was closed before it finished. Try again when you are ready."
        : "A passkey could not be added right now. Try again in a moment.",
    );
  }
}
