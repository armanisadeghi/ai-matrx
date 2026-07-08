/**
 * features/file-analysis/redact/escrow.ts
 *
 * Org-recovery escrow for reversible-redaction session keys (closes D31).
 *
 * Custody model — the raw key never transits the server after the original
 * mask response:
 *   1. The backend serves the escrow KMS RSA PUBLIC key
 *      (`GET /redact/escrow/wrapping-key`).
 *   2. THIS BROWSER wraps the AES-256-GCM session key with it
 *      (WebCrypto RSA-OAEP SHA-256) and inserts ONLY the ciphertext into
 *      `pdf.pdf_redaction_key_escrow` (direct supabase-js, owner-scoped RLS).
 *   3. Recovery (`POST /redact/escrow/recover`) is the one sensitive door:
 *      the backend KMS-Decrypts for the row owner or an org owner/admin,
 *      audit-logging every unwrap.
 *
 * IndexedDB (./session-keys.ts) stays the fast path; escrow is recovery.
 * Escrow failures are LOUD (thrown to the caller and surfaced in the
 * KeyHandoff dialog) but never block the mask itself — a broken escrow
 * pipeline must not cost the user their masked PDF.
 */

import {
  getEscrowWrappingKey,
  recoverEscrowedKey,
} from "@/features/file-analysis/api/file-analysis";
import { createClient } from "@/utils/supabase/client";
import { pdfDb } from "@/utils/supabase/pdfDb";
import { saveSession, type StoredSession } from "./session-keys";

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Explicit ArrayBuffer backing so the result satisfies WebCrypto's
  // BufferSource (Uint8Array<ArrayBufferLike> would admit SharedArrayBuffer).
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  const arr = new Uint8Array(bytes);
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Wrap a session key with the org escrow KMS public key and persist the
 * ciphertext to `pdf.pdf_redaction_key_escrow`. Throws (loudly) on any
 * failure — including 503 `escrow_not_configured` — so the caller can show
 * the user that org recovery does NOT exist for this session.
 */
export async function escrowSessionKey(
  record: StoredSession,
  organizationId: string | null,
): Promise<void> {
  const { data: wrappingKey } = await getEscrowWrappingKey();

  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(wrappingKey.public_key_spki_b64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const wrapped = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    base64ToBytes(record.session_key_b64),
  );

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(
      `Escrow write failed: no authenticated Supabase user (${authError?.message ?? "unknown"})`,
    );
  }

  const { error } = await pdfDb(supabase)
    .from("pdf_redaction_key_escrow")
    .insert({
      session_id: record.session_id,
      file_id: record.file_id,
      owner_id: user.id,
      organization_id: organizationId,
      wrapped_key: bytesToBase64(wrapped),
      wrap_alg: wrappingKey.wrap_alg,
    });
  if (error) {
    throw new Error(`Escrow write failed: ${error.message}`);
  }
}

export interface EscrowedSessionSummary {
  session_id: string;
  file_id: string | null;
  created_at: string;
  revoked: boolean;
}

/**
 * Escrow rows visible to the current user (owner-scoped RLS) for a file —
 * used by the restore flow to offer recovery for sessions whose key is
 * missing from this browser's IndexedDB.
 */
export async function listEscrowedSessionsForFile(
  fileId: string,
): Promise<EscrowedSessionSummary[]> {
  const { data, error } = await pdfDb(createClient())
    .from("pdf_redaction_key_escrow")
    .select("session_id, file_id, created_at, revoked_at")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Escrow list failed: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    session_id: row.session_id,
    file_id: row.file_id,
    created_at: row.created_at,
    revoked: row.revoked_at !== null,
  }));
}

/**
 * Recover a session key from org escrow (server KMS unwrap — owner or org
 * owner/admin only; every unwrap is audit-logged server-side). Restores the
 * key into IndexedDB so subsequent restores use the fast path.
 */
export async function recoverSessionKey(
  sessionId: string,
  fallbackFileId: string,
): Promise<StoredSession> {
  const { data } = await recoverEscrowedKey({ session_id: sessionId });

  const restored: StoredSession = {
    session_id: data.session_id,
    session_key_b64: data.session_key_b64,
    file_id: data.file_id ?? fallbackFileId,
    mode: "reversible",
    created_at: Date.now(),
    notes: "Recovered via organization escrow.",
  };
  await saveSession(restored);
  return restored;
}
