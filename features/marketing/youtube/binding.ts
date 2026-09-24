/**
 * THE BRAND ↔ OWNED-CHANNEL BINDING — one reader, one writer, one shape.
 *
 * `POST /google-sync/youtube/refresh` needs two facts before it can read a
 * single video: which connected Google account (`connection_id`) and which
 * owned channel (`channel_id`). Until U-M3 nothing wrote them down: a channel's
 * only record is a `users.integration_connection_resources` row with
 * `resource_type = 'youtube_channel'`, discovered at connect time and bound to
 * nothing.
 *
 * The binding lives on `web.brand.integrations`, the SAME jsonb document shape
 * `web.site.integrations` already carries for the Google Analytics 4 property
 * (U-M1), parsed and written by the SAME module
 * (`features/marketing/data/integrations-schema.ts`, key `youtubeChannel`).
 * Chair ruling 2 of this unit; the reason is in
 * `migrations/brand_integrations_youtube_channel.sql`.
 *
 * 🚨 THE COLUMN IS NOT LIVE UNTIL THE CHAIR APPLIES THAT FILE, AND THIS MODULE
 * SAYS SO RATHER THAN GUESSING. Per campaign ruling A11 a lane writes a
 * migration and the chair applies it, so between those two moments PostgREST
 * answers this read with `42703 column brand.integrations does not exist`. That
 * is NOT "no channel is bound" — a brand that has one would be shown a binding
 * door that saves into a column that is not there. So the absence is its own
 * state (`column_absent`), carrying the remedy, and the panel prints it. Once
 * the column is live and `pnpm db-types` has run, the two `unknown` narrowings
 * below are the only thing to delete (the F-25 pattern: a new server fact is
 * narrowed at the boundary so nothing shipped depends on a type that has not
 * been regenerated yet).
 */

"use client";

import { guardedUpdate } from "@ai-matrx/data/db";
import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";
import {
  buildSiteIntegrationsWithProviderChange,
  emptyProviderIntegration,
  parseSiteIntegrations,
  type ProviderIntegrationDraft,
} from "@/features/marketing/data/integrations-schema";
import type { Json } from "@/types/database.types";

import type { BrandChannelBinding } from "./types";

/** PostgREST's code for "that column does not exist" (Postgres 42703). */
const UNDEFINED_COLUMN = "42703";

export const BINDING_COLUMN_ABSENT_SENTENCE =
  "This brand cannot hold a YouTube channel binding yet: the `integrations` column on `web.brand` has not been applied to the database. " +
  "Nothing is broken and nothing was lost — apply `migrations/brand_integrations_youtube_channel.sql` and this panel can bind a channel.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The raw row this module reads. `integrations` is typed `unknown` ON PURPOSE:
 * `types/database.types.ts` does not carry it until the migration is applied and
 * the types are regenerated, and hand-editing a generated file is forbidden.
 */
interface BrandBindingRow {
  id: string;
  version: number;
  organizationId: string;
  integrations: unknown;
}

function narrowRow(value: unknown): BrandBindingRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.version !== "number" ||
    typeof value.organization_id !== "string"
  )
    return null;
  return {
    id: value.id,
    version: value.version,
    organizationId: value.organization_id,
    integrations: value.integrations,
  };
}

/** A jsonb document as the schema module wants it, or an empty one. */
function asDocument(value: unknown): Json {
  return isRecord(value) ? (value as Json) : ({} as Json);
}

/** The channel binding stored on one brand. */
export async function readBrandChannelBinding(
  brandId: string,
  signal?: AbortSignal,
): Promise<BrandChannelBinding> {
  // ONE cast, with its reason: the generated types have no `integrations` on
  // `web.brand` yet, so the typed builder cannot name the column. Everything
  // that comes back is narrowed above before it is used.
  const query = supabase
    .schema("web")
    .from("brand")
    .select("id, version, organization_id, integrations" as "id, version, organization_id")
    .eq("id", brandId)
    .is("deleted_at", null);
  const response = (await (signal
    ? query.abortSignal(signal).maybeSingle()
    : query.maybeSingle())) as unknown as {
    data: unknown;
    error: PostgrestError | null;
  };
  if (response.error) {
    if (response.error.code === UNDEFINED_COLUMN) {
      return { state: "column_absent", sentence: BINDING_COLUMN_ABSENT_SENTENCE };
    }
    throw new Error(response.error.message);
  }
  const row = narrowRow(response.data);
  if (!row) {
    throw new Error(
      `This brand could not be read (${brandId}), so we cannot say which YouTube channel it is bound to.`,
    );
  }
  const draft = parseSiteIntegrations(asDocument(row.integrations)).youtubeChannel;
  const connectionId = draft.credentialRef.trim();
  const channelId = draft.resourceRef.trim();
  if (!draft.enabled || !connectionId || !channelId) {
    return { state: "unbound", brandVersion: row.version };
  }
  return {
    state: "bound",
    connectionId,
    channelId,
    brandVersion: row.version,
    organizationId: row.organizationId,
  };
}

/** The draft this module writes for a bound channel. */
export function channelBindingDraft(args: {
  connectionId: string;
  channelId: string;
}): ProviderIntegrationDraft {
  return {
    ...emptyProviderIntegration(),
    enabled: true,
    // The connected Google account IS the credential authority for a channel —
    // the same word the site's GA4 binding uses for the same kind of fact.
    credentialAuthority: "external_connection",
    credentialRef: args.connectionId,
    resourceRef: args.channelId,
  };
}

class BrandVersionConflictError extends Error {
  constructor() {
    super(
      "This brand changed while you were binding a channel. Reload and try again.",
    );
    this.name = "BrandVersionConflictError";
  }
}

/**
 * Bind (or unbind) this brand's owned channel.
 *
 * Optimistic concurrency through `guardedUpdate` — the platform's ONE guarded
 * read-modify-write (`@ai-matrx/data/db`); never a hand-rolled `updated_at`
 * comparison. The provider rebase (`buildSiteIntegrationsWithProviderChange`)
 * keeps a concurrent edit to a SIBLING provider on this document from being
 * overwritten and refuses a concurrent edit to THIS one.
 */
export async function writeBrandChannelBinding(args: {
  brandId: string;
  expectedVersion: number;
  expected: ProviderIntegrationDraft;
  next: ProviderIntegrationDraft;
}): Promise<void> {
  const current = await readBrandChannelBindingDocument(args.brandId);
  if (current.state === "column_absent") {
    throw new Error(BINDING_COLUMN_ABSENT_SENTENCE);
  }
  const integrations = buildSiteIntegrationsWithProviderChange(
    current.document,
    "youtubeChannel",
    args.expected,
    args.next,
  );
  const result = await guardedUpdate<{ id: string; version: number }>({
    expectedVersion: args.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase
        .schema("web")
        .from("brand")
        .update({ integrations, version: nextVersion } as unknown as never)
        .eq("id", args.brandId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select("id, version")
        .maybeSingle(),
    fetchCurrent: () =>
      supabase
        .schema("web")
        .from("brand")
        .select("id, version")
        .eq("id", args.brandId)
        .is("deleted_at", null)
        .maybeSingle(),
  });
  if (result.status !== "saved") throw new BrandVersionConflictError();
}

/** The whole integrations document, so a write rebases onto siblings. */
async function readBrandChannelBindingDocument(
  brandId: string,
): Promise<{ state: "read"; document: Json } | { state: "column_absent" }> {
  const response = (await supabase
    .schema("web")
    .from("brand")
    .select("id, version, organization_id, integrations" as "id, version, organization_id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle()) as unknown as { data: unknown; error: PostgrestError | null };
  if (response.error) {
    if (response.error.code === UNDEFINED_COLUMN) return { state: "column_absent" };
    throw new Error(response.error.message);
  }
  const row = narrowRow(response.data);
  if (!row) {
    throw new Error(
      `This brand could not be read (${brandId}), so its channel binding cannot be saved.`,
    );
  }
  return { state: "read", document: asDocument(row.integrations) };
}
