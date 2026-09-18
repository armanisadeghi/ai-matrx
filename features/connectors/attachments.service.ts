/**
 * Conversation attachments client — aidream `/api/connections/resources` and
 * `/api/ai/conversations/{id}/attachments`.
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
 *
 * 🚨 EVERY PATH IS A KEY OF THE GENERATED CONTRACT. The conversation routes
 * are mounted under aidream's `/ai` router, and its legacy `/api` prefix is
 * stripped by a compatibility middleware — so a hand-typed
 * `/api/conversations/{id}/attachments` reaches the server as
 * `/conversations/{id}/attachments`, matches nothing, and every chat that
 * carried an attachable connection read "HTTP 404" (2026-09-17). The route
 * templates below are checked against `paths` at type-check time; a path the
 * server does not publish fails `pnpm type-check`, never a user.
 */

import { createClient } from "@/utils/supabase/client";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import type { paths } from "@/types/python-generated/api-types";
import type {
  ConversationAttachment,
  PendingAttachment,
} from "./attachable-resources";

/** Route templates, exactly as the generated contract publishes them. */
const RESOURCES_ROUTE = "/connections/resources" satisfies keyof paths;
const ATTACHMENTS_ROUTE =
  "/ai/conversations/{conversation_id}/attachments" satisfies keyof paths;
const ATTACHMENT_ROUTE =
  "/ai/conversations/{conversation_id}/attachments/{association_id}" satisfies keyof paths;

/** Fill a contract route template; every `{param}` must be supplied. */
function fillRoute(
  template: keyof paths,
  params: Record<string, string>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Route ${template} is missing its {${name}} parameter.`);
    }
    return encodeURIComponent(value);
  });
}

/**
 * One thing the user could attach, as the candidate endpoint returns it.
 * Deliberately close to `ConversationAttachment` minus the association: the
 * chooser turns a candidate into a pick without reshaping it.
 */
export interface AttachableCandidate {
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

/**
 * The sentence a failed response carries. The body is read ONCE as text
 * (a `.json()` that fails consumes the body, so a `.text()` after it is always
 * empty — which is how a 404 reached the Error Inspector as a bare "HTTP 404").
 * aidream's attachment errors are `{detail: {code, message, remedy}}`; plain
 * FastAPI errors are `{detail: "…"}`; anything else names the status and the
 * route so the failure is at least locatable.
 */
async function failureMessage(
  resp: Response,
  method: string,
  path: string,
): Promise<string> {
  const text = await resp.text().catch(() => "");
  let detail: unknown;
  try {
    detail = text ? (JSON.parse(text) as { detail?: unknown }).detail : undefined;
  } catch {
    detail = undefined;
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const { message, remedy } = detail as { message?: unknown; remedy?: unknown };
    if (typeof message === "string" && message.trim()) {
      return typeof remedy === "string" && remedy.trim()
        ? `${message} ${remedy}`
        : message;
    }
    return JSON.stringify(detail);
  }
  return `HTTP ${resp.status} from ${method} /api${path}`;
}

async function attachFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const method = init?.method ?? "GET";
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
    throw new Error(await failureMessage(resp, method, path));
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
    `${RESOURCES_ROUTE}?${params.toString()}`,
    { signal: args.signal },
  );
}

/** Everything attached to this conversation. */
export function fetchConversationAttachments(
  conversationId: string,
): Promise<ConversationAttachment[]> {
  return attachFetch<ConversationAttachment[]>(
    fillRoute(ATTACHMENTS_ROUTE, { conversation_id: conversationId }),
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
    fillRoute(ATTACHMENTS_ROUTE, { conversation_id: conversationId }),
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
    fillRoute(ATTACHMENT_ROUTE, {
      conversation_id: conversationId,
      association_id: associationId,
    }),
    { method: "DELETE" },
  );
}
