/**
 * "Send this to Google" — the ONE path every surface uses to push content the
 * user is looking at into their own Google Drive.
 *
 * There is deliberately no per-surface Google code anywhere else. A surface
 * supplies content and a title; this resolves the user's connected account,
 * creates the file, and hands back a link to open it. Everything it touches is
 * inside the approved boundary: `drive.file` covers files this app CREATES for
 * the user, and the new file self-registers so the agent tools can keep working
 * on it afterwards without the user picking it again.
 *
 * Callers never see an exception for the ordinary "not connected yet" case —
 * that comes back as a typed result carrying the one-click fix.
 */

import {
  createGoogleDocument,
  createGoogleSheet,
} from "@/features/google-workspace/service";
import {
  GOOGLE_WORKSPACE_SETTINGS_HREF,
  resolveGoogleWorkspaceConnection,
} from "@/features/google-workspace/connection";
import { BackendApiError } from "@/lib/api/errors";

export type SendToGoogleResult =
  | { ok: true; name: string; fileId: string; openUrl: string | null }
  | { ok: false; reason: "not_connected"; settingsHref: string }
  /**
   * The connection looked healthy client-side but the server refused —
   * typically an expired grant needing reconnect. `message` is the server's
   * user-facing explanation (it names where to reconnect). Callers surface it;
   * they never see a raw exception from this module.
   */
  | { ok: false; reason: "failed"; message: string };

const MAX_TITLE = 200;

/** Trim a free-form heading down to something Drive will accept as a name. */
export function googleFileTitle(title: string | undefined, fallback: string): string {
  const cleaned = (title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  return cleaned || fallback;
}

async function connection(): Promise<
  { ok: true; connectionId: string } | { ok: false; reason: "not_connected"; settingsHref: string }
> {
  const resolved = await resolveGoogleWorkspaceConnection();
  if (!resolved) {
    return {
      ok: false,
      reason: "not_connected",
      settingsHref: GOOGLE_WORKSPACE_SETTINGS_HREF,
    };
  }
  return { ok: true, connectionId: resolved.connectionId };
}

function failure(error: unknown): SendToGoogleResult {
  if (error instanceof BackendApiError) {
    // Already screamed by the API layer's capture; here we only translate it
    // into the typed result the caller can show.
    return { ok: false, reason: "failed", message: error.detail || error.userMessage };
  }
  // Anything else is a programming bug wearing a soft result — scream before
  // degrading (console.error is captured into the Error Inspector).
  console.error("[sendToGoogle] non-API failure while creating a Google file", error);
  return {
    ok: false,
    reason: "failed",
    message:
      error instanceof Error ? error.message : "Google did not accept the request.",
  };
}

export async function sendContentToGoogleDoc(
  content: string,
  title?: string,
): Promise<SendToGoogleResult> {
  const link = await connection();
  if (!link.ok) return link;
  try {
    const file = await createGoogleDocument(
      link.connectionId,
      googleFileTitle(title, "AI Matrx document"),
      content,
    );
    return {
      ok: true,
      name: file.name,
      fileId: file.fileId,
      openUrl: file.webViewLink,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Rows in, Sheet out. Column order is taken from the union of the rows' keys in
 * first-seen order, so a caller passes the same array it would export as CSV
 * and gets a header row for free.
 */
export async function sendRowsToGoogleSheet(
  rows: Array<Record<string, unknown>>,
  title?: string,
): Promise<SendToGoogleResult> {
  const link = await connection();
  if (!link.ok) return link;
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const values: string[][] = [
    columns,
    ...rows.map((row) => columns.map((key) => cellText(row?.[key]))),
  ];
  try {
    const file = await createGoogleSheet(
      link.connectionId,
      googleFileTitle(title, "AI Matrx export"),
      values,
    );
    return {
      ok: true,
      name: file.name,
      fileId: file.fileId,
      openUrl: file.webViewLink,
    };
  } catch (error) {
    return failure(error);
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
