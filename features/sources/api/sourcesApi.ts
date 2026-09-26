"use client";

/**
 * features/sources/api/sourcesApi.ts
 *
 * The client side of the landing door's WRITE routes (SOURCE-CONVERGENCE §3.1):
 * `POST /sources/land` and `POST /sources/{id}/keep`; `/sources/{id}/edit`
 * joins them when a surface edits a Source. Every page, transcript or file the platform
 * acquires is a Source — a `docproc.processed_documents` row — and keeping or
 * filing one is a server write, because Keep is the signal that starts its
 * (metered) AI processing. READS never come through here: Sources are read
 * directly from Supabase under RLS.
 *
 * Wire types are the generated contract (`types/python-generated/api-types.ts`),
 * never a hand-written mirror. `postJson` attaches the JWT and the
 * `X-Organization-Id` header and turns a refusal into a `BackendApiError`
 * carrying the server's own sentence.
 */

import { postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";
import type { components } from "@/types/python-generated/api-types";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";

export type LandedSource = components["schemas"]["LandedSource"];
export type LandingNotice = components["schemas"]["LandingNotice"];
export type SourceAttachTarget = components["schemas"]["AttachTarget"];
export type KeepSourceBody = components["schemas"]["KeepBody"];
export type SourceLandingBody = components["schemas"]["SourceLanding"];
export type EditSourceBody = components["schemas"]["EditBody"];
export type SourcePortion = components["schemas"]["Portion"];

export function sourceEditPath(processedDocumentId: string): string {
  return `/sources/${encodeURIComponent(processedDocumentId)}/edit`;
}

/**
 * A person's edit of a Source's text, through the door (§1 rule 4): the door
 * mints a `manual_curation` version beside the original and makes it the
 * version people read. `portions` is the WHOLE body (every portion, in
 * order) — the door stores exactly what it is given. The answer's
 * `processed_document_id` is the NEW version; `new_version_of` the original.
 */
export async function editSource(
  processedDocumentId: string,
  portions: SourcePortion[],
  options: { organizationId: string },
): Promise<LandedSource> {
  const { data } = await postJson<LandedSource, EditSourceBody>(
    sourceEditPath(processedDocumentId),
    { portions },
    { organizationId: options.organizationId },
  );
  return data;
}

export const SOURCE_LAND_PATH = "/sources/land";

/**
 * Land one acquisition as a Source through the door (`POST /sources/land`).
 * The body names its organization (`organization_id`) and so does the
 * request header — the same id, captured once by the caller.
 */
export async function landSource(
  body: SourceLandingBody,
): Promise<LandedSource> {
  const { data } = await postJson<LandedSource, SourceLandingBody>(
    SOURCE_LAND_PATH,
    body,
    { organizationId: body.organization_id },
  );
  return data;
}

export function sourceKeepPath(processedDocumentId: string): string {
  return `/sources/${encodeURIComponent(processedDocumentId)}/keep`;
}

/**
 * Keep a Source and/or file it against the given targets. The organization is
 * the one the caller already ensured (`ensureOrganizationContext`) — named on
 * the request, never picked here.
 */
export async function keepSource(
  processedDocumentId: string,
  options: { attachTo?: SourceAttachTarget[]; organizationId: string },
): Promise<LandedSource> {
  const body: KeepSourceBody = {
    keep: true,
    attach_to: options.attachTo ?? [],
  };
  const { data } = await postJson<LandedSource, KeepSourceBody>(
    sourceKeepPath(processedDocumentId),
    body,
    { organizationId: options.organizationId },
  );
  return data;
}

/**
 * Where a Source opens: the one Source screen (SOURCE-CONVERGENCE §8.2). Every
 * old viewer route redirects there with its params; this is the one place a
 * surface asks.
 */
export function sourceHref(processedDocumentId: string): string {
  return sourceStudioPath(processedDocumentId);
}

/**
 * The sentence to show a person when a Source route refuses.
 *
 * The door writes every refusal as a sentence for a person (`LandingError`:
 * "A 'inline' cannot be landed as a Source: …"), but the server's error
 * envelope files a 422 under `validation_error` and replaces `user_message`
 * with the generic "Invalid request. Please check your input and try again."
 * The door's own words arrive as `message` (`BackendApiError.detail`); on a
 * 4xx from these routes they are the honest answer, so they win.
 */
export function sourceRefusalSentence(error: unknown): string {
  if (error instanceof BackendApiError) {
    const own = error.detail?.trim();
    if (
      own &&
      error.status !== null &&
      error.status >= 400 &&
      error.status < 500
    )
      return own;
    return error.userMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  return "The server did not say why.";
}
