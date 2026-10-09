"use client";

// features/esign/envelopes/service.ts — the sender's half of /esign, client side.
//
// READS go straight to the database (`public.esign_envelope_list`, `esign_envelope_state`,
// `esign_verify_envelope` — each decides access itself). WRITES go to aidream's
// `/esign/envelopes` (services/esign/envelopes.py), which checks the caller's right and then
// drives the server-only create/send/remind/resend/void doors. Nothing here decides a right.

import { failureSentence } from "../serverFailure";
import { callApi } from "@/lib/api/call-api";
import type { ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@ai-matrx/agents/generated/api-types";
import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { ListScopeWord } from "@/lib/list-scope";
import { listOrgParam } from "@/lib/list-scope/types";
import type { EnvelopeListRow } from "./types";

export type SendBody = Omit<components["schemas"]["EsignSendBody"], "organization_id" | "project_id" | "task_id">;
export type SendAnswer = components["schemas"]["EsignSendAnswer"];
export type EnvelopeActAnswer = components["schemas"]["EsignEnvelopeActAnswer"];

/** The server answered and refused, with the sentence the sender reads. */
export class EnvelopeRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeRefusal";
  }
}

// Every write names its organization (law): the envelope's own, learned when its state is read — a
// page that opens on an envelope and finishes what completion owes must not wait on a selection.
const organizationOf = new Map<string, string>();
function scopeFor(envelopeId: string): { scopeOverrides?: { organization_id: string } } {
  const organization_id = organizationOf.get(envelopeId);
  return organization_id ? { scopeOverrides: { organization_id } } : {};
}

function read<T>(result: ApiCallResult): T {
  if (!result.error && result.data !== undefined) return result.data as T;
  const detail = result.error?.serverDetail as { detail?: { message?: unknown } } | undefined;
  const message = detail?.detail?.message;
  if (typeof message !== "string" || message === "") console.error("[esign] the server did not answer the sender", result.error);
  throw new EnvelopeRefusal(
    typeof message === "string" && message !== ""
      ? message
      : failureSentence(result.error),
  );
}

// ─── reads ─────────────────────────────────────────────────────────────────────

async function listEnvelopes(lane: "all" | "sent", query: EntityListQuery): Promise<EnvelopeListRow[]> {
  const { data, error } = await supabase.rpc("esign_envelope_list", {
    p_lane: lane,
    p_org_id: listOrgParam(query),
    p_search: query.search.trim() || undefined,
    p_limit: 500,
  });
  if (error) throw operationFailed("load your envelopes", error);
  const answer = data as { granted?: boolean; envelopes?: EnvelopeListRow[] } | null;
  return answer?.envelopes ?? [];
}

function laneFor(scope?: ListScopeWord | string): "all" | "sent" {
  return scope === "mine" ? "sent" : "all";
}

const SORTABLE: Record<string, (row: EnvelopeListRow) => string | number> = {
  title: (r) => r.title.toLowerCase(),
  status: (r) => r.status,
  sent_at: (r) => r.sent_at ?? "",
  updated_at: (r) => r.updated_at,
  created_at: (r) => r.created_at,
  progress: (r) => (r.signer_count ? r.signed_count / r.signer_count : 0),
  organization_name: (r) => r.organization_name ?? "",
};

export async function fetchEnvelopeListPage(
  query: EntityListQuery,
  sort: EntityListSort,
  scope?: ListScopeWord,
): Promise<EntityListPage<EnvelopeListRow>> {
  const rows = await listEnvelopes(laneFor(scope ?? query.scope.kind), query);
  const key = SORTABLE[sort.sort] ?? SORTABLE.updated_at;
  const sorted = [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const order = x < y ? -1 : x > y ? 1 : 0;
    return sort.direction === "asc" ? order : -order;
  });
  const from = (query.page - 1) * sort.pageSize;
  return { rows: sorted.slice(from, from + sort.pageSize), total: sorted.length };
}

export async function fetchEnvelopeScopeCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
  const [all, mine] = await Promise.all([listEnvelopes("all", query), listEnvelopes("sent", query)]);
  return { byKind: { all: all.length, mine: mine.length }, narrow: {} };
}

export async function fetchEnvelopeFacets(): Promise<EntityFacets> {
  return { byKind: {} };
}

export interface EnvelopeState {
  envelope: Record<string, unknown>;
  documents: Record<string, unknown>[];
  signers: Record<string, unknown>[];
  events: Record<string, unknown>[];
  /** Added by the e-sign parity doors (CONTRACT §5.4); absent from an older answer. */
  draft: Record<string, unknown> | null;
  scheduledNotices: Record<string, unknown>[];
  progress: Record<string, { required_total: number; required_done: number }>;
  finalize: { copies_owed?: boolean; certificate_owed?: boolean; emails_owed?: boolean } | null;
}

/** One envelope with its documents, signers and evidence trail — or null when the caller may not see it. */
export async function fetchEnvelope(envelopeId: string): Promise<EnvelopeState | null> {
  const { data, error } = await supabase.rpc("esign_envelope_state", { p_envelope_id: envelopeId });
  if (error) throw operationFailed("load this envelope", error);
  const answer = data as
    | ({ granted?: boolean; scheduled_notices?: Record<string, unknown>[] } & Partial<Omit<EnvelopeState, "scheduledNotices">>)
    | null;
  if (!answer?.granted) return null;
  const organizationId = answer.envelope?.organization_id;
  if (typeof organizationId === "string") organizationOf.set(envelopeId, organizationId);
  return {
    envelope: answer.envelope ?? {},
    documents: answer.documents ?? [],
    signers: answer.signers ?? [],
    events: answer.events ?? [],
    draft: answer.draft ?? null,
    scheduledNotices: answer.scheduled_notices ?? [],
    progress: answer.progress ?? {},
    finalize: answer.finalize ?? null,
  };
}

/**
 * Whether the stored documents still hash to what was signed and the certificate verifies. The
 * server re-reads the frozen bytes (a check with no observed hashes would check nothing).
 */
export async function verifyEnvelope(dispatch: AppDispatch, envelopeId: string): Promise<EnvelopeActAnswer> {
  return read<EnvelopeActAnswer>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/verify",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        ...scopeFor(envelopeId),
        expectedErrorStatuses: [403, 409],
      }),
    ),
  );
}

// ─── writes ────────────────────────────────────────────────────────────────────

export async function sendEnvelope(dispatch: AppDispatch, body: SendBody): Promise<SendAnswer> {
  return read<SendAnswer>(
    await dispatch(
      callApi({ path: "/esign/envelopes", method: "POST", body, expectedErrorStatuses: [400, 403, 409, 422] }),
    ),
  );
}

export async function remindEnvelope(dispatch: AppDispatch, envelopeId: string): Promise<EnvelopeActAnswer> {
  return read<EnvelopeActAnswer>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/remind",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        ...scopeFor(envelopeId),
        expectedErrorStatuses: [403, 409],
      }),
    ),
  );
}

export async function resendToSigner(
  dispatch: AppDispatch,
  envelopeId: string,
  signerId: string,
  email: string | null,
): Promise<EnvelopeActAnswer> {
  return read<EnvelopeActAnswer>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/signers/{signer_id}/resend",
        method: "POST",
        pathParams: { envelope_id: envelopeId, signer_id: signerId },
        ...scopeFor(envelopeId),
        body: { email },
        expectedErrorStatuses: [403, 409, 422],
      }),
    ),
  );
}

export async function voidEnvelope(dispatch: AppDispatch, envelopeId: string, reason: string): Promise<EnvelopeActAnswer> {
  return read<EnvelopeActAnswer>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/void",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        ...scopeFor(envelopeId),
        body: { reason },
        expectedErrorStatuses: [403, 409, 422],
      }),
    ),
  );
}

// ─── e-sign parity routes (CONTRACT §7) ───────────────────────────────────────────────

export interface DownloadedFile {
  name: string;
  mime_type: string;
  content_base64: string;
}

/** The documents, the certificate, or both — each file or one combined PDF. */
export async function downloadEnvelope(
  dispatch: AppDispatch,
  envelopeId: string,
  input: { parts: ("documents" | "certificate")[]; combine: boolean; documentIds?: string[] },
): Promise<DownloadedFile[]> {
  const out = read<{ files: DownloadedFile[] }>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/download",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        ...scopeFor(envelopeId),
        body: { parts: input.parts, combine: input.combine, document_ids: input.documentIds },
        expectedErrorStatuses: [403, 404, 409, 422],
      }),
    ),
  );
  return out.files ?? [];
}

export interface FinalizeAnswer {
  copies?: { document_id: string; file_id: string }[];
  certificate_id?: string | null;
  certificate_file_id?: string | null;
  emails_sent?: number;
}

/** Finish whatever completion still owes (signed copies, certificate, emails). Idempotent. */
export async function finalizeEnvelope(dispatch: AppDispatch, envelopeId: string): Promise<FinalizeAnswer> {
  return read<FinalizeAnswer>(
    await dispatch(
      callApi({
        path: "/esign/envelopes/{envelope_id}/finalize",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        ...scopeFor(envelopeId),
        body: {},
        expectedErrorStatuses: [403, 404, 409, 422],
      }),
    ),
  );
}
