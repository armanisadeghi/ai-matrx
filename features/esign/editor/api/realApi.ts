"use client";

// features/esign/editor/api/realApi.ts — the editor on the real doors (CONTRACT §6.1, §7).
// Reads/writes of drafts and templates go browser → Supabase RPC directly; only send and
// detect-fields (real work) go to aidream. The RPC and route names are not in the generated
// types until the server lane's wave A/B publish — `loose` is the one place that is bridged, and it
// narrows to typed calls the moment `types/database.types.ts` and api-types carry them.

import type { components } from "@ai-matrx/agents/generated/api-types";
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";

import type { EnvelopeDraftV1, EnvelopeTemplateV1 } from "../../contract/draft";
import { DraftRefusal, type EditorApi, type SaveResult, type TemplateRow } from "./types";

type Schemas = components["schemas"];
type RpcAnswer = { data: unknown; error: { message: string } | null };
type EsignRpcName = keyof Database["esign"]["Functions"];
const esign = supabase.schema("esign");
// One typed seam: the name is checked against the generated `esign` functions; arguments are
// built at each call site from the contract shapes.
const loose = {
  rpc(name: EsignRpcName, args?: Record<string, unknown>): Promise<RpcAnswer> {
    return (esign as unknown as { rpc(n: string, a?: Record<string, unknown>): Promise<RpcAnswer> }).rpc(name, args);
  },
};

const REFUSAL_TEXT: Record<string, string> = {
  not_a_member: "You are not a member of that organization.",
  no_access: "You do not have access to this.",
  not_draft: "This envelope was already sent.",
  template_not_found: "That template no longer exists.",
  draft_invalid: "This draft has something we could not save.",
  code_too_short: "An access code needs at least 4 characters.",
  stale_template: "Someone changed this template. Reload it.",
  no_documents: "Add a document first.",
  no_signers: "Add someone to sign first.",
  signer_email_invalid: "A recipient's email is not valid.",
  not_a_pdf: "One of the documents is not a PDF.",
  file_not_found: "One of the documents can no longer be found.",
  field_off_page: "A field sits past the end of its document.",
};

function refusal(answer: Record<string, unknown>): DraftRefusal {
  const code = String(answer.reason ?? answer.code ?? "refused");
  return new DraftRefusal(code, REFUSAL_TEXT[code] ?? "That could not be done right now.", answer);
}

async function door(name: EsignRpcName, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await loose.rpc(name, args);
  if (error) throw new DraftRefusal("unreachable", "We could not reach AI Matrx just now. Try again in a moment.", { message: error.message });
  const answer = (data ?? {}) as Record<string, unknown>;
  if (answer.granted === false) throw refusal(answer);
  return answer;
}

// The token for the unload flush: sessions are read asynchronously, but pagehide cannot await.
let cachedToken: string | null = null;
if (typeof window !== "undefined") {
  void supabase.auth.getSession().then(({ data }) => (cachedToken = data.session?.access_token ?? null));
  supabase.auth.onAuthStateChange((_e, session) => (cachedToken = session?.access_token ?? null));
}

/** Template doors need no server round trip — the list page and the editor share these. */
export async function listTemplateRows(input: { lane: "all" | "mine"; orgId: string | null; search: string }): Promise<TemplateRow[]> {
  const a = await door("esign_template_list", { p_lane: input.lane, p_org_id: input.orgId, p_search: input.search.trim() || null, p_limit: 200 });
  return (a.templates as TemplateRow[]) ?? [];
}

export async function deleteTemplateRow(templateId: string): Promise<void> {
  await door("esign_template_delete", { p_template_id: templateId });
}

export function makeRealEditorApi(dispatch: AppDispatch): EditorApi {
  const refused = (result: ApiCallResult): DraftRefusal => {
    const detail = (result.error?.serverDetail as { detail?: { code?: string; message?: string } } | undefined)?.detail;
    return new DraftRefusal(
      detail?.code ?? "unreachable",
      detail?.message || REFUSAL_TEXT[detail?.code ?? ""] || "We could not reach AI Matrx just now. Try again in a moment.",
      detail as Record<string, unknown> | undefined,
    );
  };

  return {
    async createDraft({ organizationId, title, templateId, copyOfEnvelopeId }) {
      const a = await door("esign_draft_create", {
        p_organization_id: organizationId,
        p_title: title,
        p_template_id: templateId ?? null,
        p_copy_of_envelope_id: copyOfEnvelopeId ?? null,
      });
      return { envelopeId: String(a.envelope_id), revision: Number(a.revision), composition: a.composition as EnvelopeDraftV1 };
    },

    async loadDraft(envelopeId) {
      // CONTRACT §21: esign_draft_get → {envelope:{id,status,organization_id,title}, draft:{composition,revision,saved_at}}.
      const { data, error } = await loose.rpc("esign_draft_get", { p_envelope_id: envelopeId });
      if (error) throw new DraftRefusal("unreachable", "We could not reach AI Matrx just now. Try again in a moment.");
      const a = (data ?? {}) as Record<string, unknown>;
      if (a.granted === false) return null;
      const envelope = (a.envelope ?? {}) as Record<string, unknown>;
      const draft = (a.draft ?? null) as Record<string, unknown> | null;
      const composition = (draft && "composition" in draft ? draft.composition : draft) as EnvelopeDraftV1 | null;
      return {
        revision: Number(draft?.revision ?? a.draft_revision ?? 0),
        composition: composition as EnvelopeDraftV1,
        status: String(envelope.status ?? "sent"),
        organizationId: String(envelope.organization_id ?? ""),
      };
    },

    async saveDraft(envelopeId, composition, baseRevision): Promise<SaveResult> {
      const { data, error } = await loose.rpc("esign_draft_save", {
        p_envelope_id: envelopeId,
        p_composition: composition,
        p_base_revision: baseRevision,
      });
      if (error) throw new DraftRefusal("unreachable", "We could not reach AI Matrx just now.");
      const a = (data ?? {}) as Record<string, unknown>;
      if (a.granted === false) {
        if (a.reason === "stale_draft") {
          return { ok: false, reason: "stale", revision: Number(a.revision), composition: a.composition as EnvelopeDraftV1 };
        }
        throw refusal(a);
      }
      return { ok: true, revision: Number(a.revision), savedAt: String(a.saved_at ?? new Date().toISOString()) };
    },

    saveDraftOnExit(envelopeId, composition, baseRevision) {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!base || !key || !cachedToken) return;
      void fetch(`${base}/rest/v1/rpc/esign_draft_save`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Profile": "esign", "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${cachedToken}` },
        body: JSON.stringify({ p_envelope_id: envelopeId, p_composition: composition, p_base_revision: baseRevision }),
      }).catch(() => undefined); // the local mirror restores whatever this misses
    },

    async setAccessCode(envelopeId, recipientKey, code) {
      const a = await door("esign_draft_set_access_code", { p_envelope_id: envelopeId, p_recipient_key: recipientKey, p_code: code });
      return { hasAccessCode: a.has_access_code === true };
    },

    async deleteDraft(envelopeId) {
      await door("esign_draft_delete", { p_envelope_id: envelopeId });
    },

    async send(envelopeId) {
      const result = await dispatch(
        callApi({
          path: "/esign/drafts/{envelope_id}/send",
          method: "POST",
          pathParams: { envelope_id: envelopeId },
          body: {},
          expectedErrorStatuses: [400, 403, 404, 409, 422],
        }),
      );
      if (result.error || result.data === undefined) throw refused(result);
      const sent = result.data as Schemas["EsignDraftSendAnswer"];
      return { ...sent, warnings: sent.warnings ?? [] };
    },

    async detectFields(fileId) {
      const result = await dispatch(
        callApi({ path: "/esign/detect-fields", method: "POST", body: { file_id: fileId }, expectedErrorStatuses: [400, 403, 404, 409, 422] }),
      );
      if (result.error || result.data === undefined) throw refused(result);
      return (result.data as Schemas["EsignDetectFieldsAnswer"]).candidates;
    },

    async saveTemplate({ organizationId, templateId, name, description, composition, expectedVersion }) {
      const a = await door("esign_template_save", {
        p_organization_id: organizationId,
        p_template_id: templateId,
        p_name: name,
        p_description: description,
        p_composition: composition,
        p_expected_version: expectedVersion ?? null,
      });
      return { templateId: String(a.template_id), version: Number(a.version) };
    },

    async getTemplate(templateId) {
      const { data } = await loose.rpc("esign_template_get", { p_template_id: templateId });
      const a = (data ?? {}) as { granted?: boolean; template?: Record<string, unknown> };
      if (a.granted === false || !a.template) return null;
      const t = a.template;
      return {
        id: String(t.id),
        name: String(t.name ?? ""),
        description: (t.description as string | null) ?? null,
        organizationId: String(t.organization_id ?? ""),
        version: Number(t.version ?? 1),
        composition: t.composition as EnvelopeTemplateV1,
      };
    },

    listTemplates: listTemplateRows,

    deleteTemplate: deleteTemplateRow,
  };
}
