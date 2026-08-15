/** The single Cartesia credential adapter. The broker owns minting and cache lifetime. */
import { getBrokeredCredential, invalidateBrokeredCredential } from "@/lib/api/broker/cache";

const CARTESIA_REQUEST = {
  audience: "cartesia_tts" as const,
  tierPolicy: "none" as const,
  scopes: ["tts"],
  ttlSeconds: 600,
};

export async function getCartesiaAccessToken(options?: { forceRefresh?: boolean }): Promise<string> {
  const credential = await getBrokeredCredential(CARTESIA_REQUEST, options);
  if (credential.credential_mode !== "native_ephemeral" || credential.protocol !== "cartesia_tts_websocket") {
    throw new Error("Secure credential service returned an invalid Cartesia transport.");
  }
  return credential.token;
}

export function invalidateCartesiaAccessToken(_staleToken?: string): void {
  invalidateBrokeredCredential(CARTESIA_REQUEST);
}

export function isCartesiaAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b(401|403)\b|unauthorized|forbidden|invalid.*token|expired.*token|authentication/i.test(message);
}

export async function withCartesiaAccessToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await getCartesiaAccessToken();
  try {
    return await run(token);
  } catch (error) {
    if (!isCartesiaAuthError(error)) throw error;
    invalidateCartesiaAccessToken();
    return run(await getCartesiaAccessToken({ forceRefresh: true }));
  }
}
