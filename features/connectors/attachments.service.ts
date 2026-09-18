/**
 * Conversation attachments client — aidream `/api/connections/resources` and
 * `/api/conversations/{id}/attachments`.
 *
 * What a person picks in the chooser is not composer state and not a run
 * setting: it is a durable edge in `platform.associations`, written by the
 * server through the registered association path. That is why every call here
 * is a plain HTTP round-trip and nothing writes a junction row from the
 * browser (the `canonical-associations` skill's one-canonical-path rule).
 *
 * Errors are RAISED, never swallowed into an empty list. An attachment list
 * that renders as "nothing attached" because a request failed is the exact
 * lie the connection chips were fixed for on 2026-09-13 — the caller shows the
 * failure and its remedy instead.
 */

import { createClient } from "@/utils/supabase/client";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import type {
  ConversationAttachment,
  PendingAttachment,
} from "./attachable-resources";

/**
 * One thing the user could attach, as the candidate endpoint returns it.
 * Deliberately close to `ConversationAttachment` minus the association: the
 * chooser turns a candidate into a pick without reshaping it.
 */
export interface AttachableCandidate {
  /** The row's own id — a picked-file id, or the Record's row id (F-71). */
  resource_id: string;
  provider: string;
  resource_type: string;
  resource_ref: string;
  display_name: string;
  link: string | null;
  /**
   * What the row shows beside the name: `private · admin` for a repository,
   * `Spreadsheet · arman@…` for a Drive file. The server writes the words
   * because only it knows what matters about that provider's resources.
   */
  detail: string | null;
  /**
   * `null` for a Record-backed candidate (F-71: a synced calendar event) —
   * the server's access chokepoint already passed before this row could ever
   * be listed, so an empty value here is NOT "no access" and must never be
   * rendered as one. Only a picked file (a repository, a Drive file) carries
   * a real GitHub/Drive permission word.
   */
  permission_level: string | null;
  /**
   * Set when this candidate IS a platform Record rather than a picked file —
   * its schema-qualified table (`communication.calendar_event`), so the
   * client can open the SAME row its own screen and the archive door
   * address, through `resource_id`. `null` for a picked file.
   */
  record_table: string | null;
  metadata: Record<string, unknown> | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  // Organization admission rides with auth — aidream refuses any Bearer-JWT
  // request that names no organization. Resolved through the ONE fail-closed
  // kernel, so a missing organization throws with its remedy before any
  // networking (same pattern as `mcp-connections.service.ts`).
  const store = getStoreSingleton();
  const organizationId = requireOrganizationContext(
    store ? selectOrganizationId(store.getState()) : null,
  );
  return applyOrganizationContextHeader(
    {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    organizationId,
  );
}

async function attachFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  let resp: Response;
  try {
    resp = await fetch(`${AIDREAM_PRODUCTION_URL}/api${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
  } catch {
    throw new Error(
      "The attachments service is unreachable — the backend must be online.",
    );
  }
  if (resp.status === 204) return undefined as T;
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      detail =
        typeof body.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await resp.text().catch(() => undefined);
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

/**
 * Candidates for one provider.
 *
 * `live` asks the provider itself (Drive search) and MUST carry the query;
 * `inventory` returns what we already hold and the caller filters locally, so
 * typing never costs a round-trip.
 */
export function fetchAttachableResources(args: {
  provider: string;
  query?: string;
  limit?: number;
  live?: boolean;
  signal?: AbortSignal;
}): Promise<AttachableCandidate[]> {
  const params = new URLSearchParams({ provider: args.provider });
  if (args.query) params.set("q", args.query);
  if (args.limit != null) params.set("limit", String(args.limit));
  if (args.live) params.set("live", "true");
  return attachFetch<AttachableCandidate[]>(
    `/connections/resources?${params.toString()}`,
    { signal: args.signal },
  );
}

/** Everything attached to this conversation. */
export function fetchConversationAttachments(
  conversationId: string,
): Promise<ConversationAttachment[]> {
  return attachFetch<ConversationAttachment[]>(
    `/conversations/${encodeURIComponent(conversationId)}/attachments`,
  );
}

/**
 * Attach one resource. Idempotent on the server (re-attaching revives the
 * tombstoned edge rather than colliding), so a double click costs a round-trip
 * and nothing else.
 */
export function attachConversationResource(
  conversationId: string,
  pick: PendingAttachment,
): Promise<ConversationAttachment> {
  return attachFetch<ConversationAttachment>(
    `/conversations/${encodeURIComponent(conversationId)}/attachments`,
    {
      method: "POST",
      body: JSON.stringify({
        provider: pick.provider,
        resource_ref: pick.resource_ref,
        resource_type: pick.resource_type,
        display_name: pick.display_name,
        link: pick.link,
        metadata: pick.metadata,
      }),
    },
  );
}

/** Remove one attachment. The edge is tombstoned server-side, never purged. */
export function detachConversationResource(
  conversationId: string,
  associationId: string,
): Promise<void> {
  return attachFetch<void>(
    `/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(associationId)}`,
    { method: "DELETE" },
  );
}
