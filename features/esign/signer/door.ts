"use client";

// features/esign/signer/door.ts — THE SIGNING DOORS over `callApi` (esign-parity CONTRACT §6, §7, §13.1).
//
// One `SignerDoorApi` per page: a signed-in member acts on `/esign/signing/envelope/{id}/act`, an
// outside signer on `/esign/signing/outsider/act` with their session. The database decides
// everything; aidream adds what a browser cannot do (filing images, recording the address, the
// frozen bytes). This file decides NOTHING — it carries requests and turns answers into the
// contract's shapes and refusals:
//   - `{granted: false, reason}` or a 409 `{detail: {code, message}}` → `DoorRefusal`
//   - an outsider session another window took over, or one that ran out → `SessionEnded`
//   - an act the server does not know yet → `DoorRefusal("unknown_action")`, whose sentence says
//     the step is not available yet (law 4), never a silent no-op.

import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@ai-matrx/agents/generated/api-types";

import type { FieldPatch, FieldValue, FieldValues } from "../contract/fieldModel";
import { DoorRefusal, SessionEnded, type AdoptInput, type MarkTarget, type SignerDoorApi, type SignerLoadV2 } from "../contract/signerDoor";
import { reasonText } from "./text";

type ActBody = components["schemas"]["EsignInternalActBody"];
type Action = ActBody["action"];
type ActArgs = components["schemas"]["EsignActArgs"];
type Answer = components["schemas"]["EsignSigningAnswer"];

/**
 * The acts the published api-types know. An act the contract adds (save_values, download, …) is
 * sent only once its name is in this list — `satisfies` makes the list follow the types, so adding a
 * name here compiles exactly when the server lane's api-types carry it.
 */
const KNOWN_ACTIONS = [
  "load", "preview", "consent", "document", "adopt", "sign", "decline", "save_values", "acknowledge",
  "history", "delegate", "download", "handoff_start", "handoff_text", "handoff_status", "handoff_cancel",
] as const satisfies readonly Action[];

function knownAction(name: string): Action | null {
  return KNOWN_ACTIONS.find((a) => a === name) ?? null;
}

/**
 * The act arguments aidream's `EsignActArgs` accepts (routers/esign_signing.py, a model with
 * extra="forbid"). An argument outside it is never sent. The list is checked against the published
 * api-types in BOTH directions (`satisfies` + `MissingArg`), so a server wave that adds an argument
 * fails type-check here until it is listed — it can no longer go stale silently (it did: 2026-10-07
 * the server took save_to_profile while this list still said "not available yet").
 */
const SERVER_ARG_LIST = [
  "organization_id", "project_id", "task_id", "source_app", "source_feature", "initiation",
  "document_id", "disclosure_id", "kind", "target", "source", "values", "message_to_sender",
  "full_name", "email", "message", "typed_name", "typed_style", "strokes", "image_data_url",
  "observed", "action_id", "reason", "handoff_id", "saved_signature_id", "save_to_profile",
  "make_default", "secret", "phone", "parts", "combine", "document_ids", "time_zone",
] as const satisfies readonly (keyof ActArgs)[];
type MissingArg = Exclude<keyof ActArgs, (typeof SERVER_ARG_LIST)[number]>;
const everyArgListed: [MissingArg] extends [never] ? true : MissingArg = true;
void everyArgListed;
const SERVER_ARGS: ReadonlySet<string> = new Set(SERVER_ARG_LIST);

export function serverTakes(arg: string): boolean {
  return SERVER_ARGS.has(arg);
}

export type SignerTarget = { kind: "envelope"; envelopeId: string } | { kind: "outsider"; session: string };

const SESSION_CODES: Record<string, "taken_over" | "expired"> = {
  session_taken_over: "taken_over",
  session_expired: "expired",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isValue(v: unknown): v is FieldValue {
  return typeof v === "string" || typeof v === "boolean" || v === null;
}

/** `{field_id: {v, seq, at}}`, keeping only well-formed entries. */
function readValues(raw: unknown): FieldValues {
  const out: FieldValues = {};
  if (!isRecord(raw)) return out;
  for (const [id, e] of Object.entries(raw)) {
    if (isRecord(e) && isValue(e.v)) out[id] = { v: e.v, seq: typeof e.seq === "number" ? e.seq : 0, at: str(e.at) ?? "" };
  }
  return out;
}

/** `{field_id: v}`, keeping only well-formed values. */
function readPlain(raw: unknown): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  if (!isRecord(raw)) return out;
  for (const [id, v] of Object.entries(raw)) if (isValue(v)) out[id] = v;
  return out;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function createSignerDoor(dispatch: AppDispatch, target: SignerTarget): SignerDoorApi {
  const outsider = target.kind === "outsider";

  function refusalFrom(code: string | null | undefined, message?: unknown, detail?: Record<string, unknown>): Error {
    const c = code ?? "refused";
    if (outsider && SESSION_CODES[c]) return new SessionEnded(SESSION_CODES[c]);
    // Before the server answers `session_*` distinctly, an outsider's ended session reads as a
    // dead link; the way in re-opens through the link and says "dead" only if it truly is.
    if (outsider && c === "link_no_longer_valid") return new SessionEnded("expired");
    return new DoorRefusal(c, typeof message === "string" && message !== "" ? message : reasonText(c), detail);
  }

  function read(result: ApiCallResult): Answer {
    if (!result.error && result.data !== undefined) return result.data as Answer;
    const body = result.error?.serverDetail;
    const detail = isRecord(body) && isRecord(body.detail) ? body.detail : null;
    if (detail) throw refusalFrom(str(detail.code), detail.message, detail);
    throw new Error("transport"); // never answered: errorText says "could not reach"
  }

  async function act(name: string, wanted: ActArgs & Record<string, unknown> = {}): Promise<Answer> {
    const action = knownAction(name);
    if (!action) throw new DoorRefusal("unknown_action", reasonText("unknown_action"));
    // The server refuses an argument it does not know (extra="forbid"): send only what it takes.
    const args: ActArgs = {};
    for (const [key, value] of Object.entries(wanted)) {
      if (value !== undefined && serverTakes(key)) Reflect.set(args, key, value);
    }
    const result =
      target.kind === "envelope"
        ? await dispatch(
            callApi({
              path: "/esign/signing/envelope/{envelope_id}/act",
              method: "POST",
              pathParams: { envelope_id: target.envelopeId },
              body: { action, args },
              expectedErrorStatuses: [409, 422],
              // A signer acts on the envelope's organization, read from the envelope.
              organizationFreeRead: true,
            }),
          )
        : await dispatch(
            callApi({
              path: "/esign/signing/outsider/act",
              method: "POST",
              body: { session: target.session, action, args },
              expectedErrorStatuses: [409, 422],
              organizationFreeRead: true,
            }),
          );
    const answer = read(result);
    if (!answer.granted) {
      throw refusalFrom(answer.reason, undefined, answer);
    }
    return answer;
  }

  return {
    seat: outsider ? "outsider" : "signed_in",

    async load() {
      return toLoadV2(await act("load"));
    },

    async previewAck(documentId) {
      const a = await act("preview", { document_id: documentId });
      return {
        documents_unseen: typeof a.documents_unseen === "number" ? a.documents_unseen : 0,
        previewed_at: str(a.previewed_at),
      };
    },

    async consent(disclosureId) {
      await act("consent", { disclosure_id: disclosureId });
    },

    async documentBytes(documentId) {
      // A page that is only drawn records no download (the server reads it with purpose render, §6.2).
      const a = await act("document", { document_id: documentId });
      if (!a.content_base64) throw new DoorRefusal("document_unavailable", "This document could not be opened. Try again in a moment.");
      return {
        bytes: decodeBase64(a.content_base64),
        mime_type: a.mime_type ?? "application/octet-stream",
        content_hash: a.content_hash ?? "",
        name: a.name ?? "Document",
      };
    },

    async adopt(input: AdoptInput) {
      const a = await act("adopt", { ...input });
      const image = str(a.image_base64) ?? str(input.image_data_url)?.replace(/^data:[^,]+,/, "") ?? "";
      const t: MarkTarget = a.target === "initials" ? "initials" : a.target === "signature" ? "signature" : input.target;
      return { target: t, image_base64: image };
    },

    async saveValues(patch: FieldPatch) {
      const a = await act("save_values", { values: patch });
      return {
        values_saved_at: str(a.values_saved_at) ?? new Date().toISOString(),
        required_remaining: typeof a.required_remaining === "number" ? a.required_remaining : 0,
        current: readValues(a.current),
      };
    },

    async sign(input) {
      const a = await act("sign", {
        observed: input.observed.map((o) => ({ document_id: o.document_id, content_hash: o.content_hash })),
        action_id: input.action_id,
        time_zone: input.time_zone,
        values: input.values,
        message_to_sender: input.message_to_sender,
      });
      const next = isRecord(a.next) ? a.next : {};
      const envelope = isRecord(a.envelope) ? a.envelope : {};
      return {
        signed_at: str(a.signed_at) ?? new Date().toISOString(),
        everyone_signed: bool(next.everyone_signed, bool(envelope.completed, false)),
        remaining: typeof next.remaining === "number" ? next.remaining : 0,
        final_values: readPlain(a.final_values),
      };
    },

    async decline(reason) {
      await act("decline", { reason });
    },

    async delegate(input) {
      await act("delegate", { ...input });
    },

    async acknowledge() {
      await act("acknowledge");
    },

    async download(input) {
      const a = await act("download", { ...input });
      const files = Array.isArray(a.files) ? a.files : [];
      return files.filter(isRecord).map((f) => ({
        name: str(f.name) ?? "document.pdf",
        mime_type: str(f.mime_type) ?? "application/pdf",
        bytes: decodeBase64(str(f.content_base64) ?? ""),
      }));
    },

    async history() {
      const a = await act("history");
      const events = Array.isArray(a.events) ? a.events : [];
      return events.filter(isRecord).map((e) => ({
        event: str(e.event) ?? "",
        at: str(e.at) ?? "",
        label: str(e.label) ?? str(e.event) ?? "",
        mine: e.mine === true,
      }));
    },

    async handoffStart(t) {
      const a = await act("handoff_start", { target: t });
      return {
        handoff_id: str(a.handoff_id) ?? "",
        path: str(a.path) ?? "",
        secret: str(a.secret) ?? "",
        expires_at: str(a.expires_at) ?? "",
      };
    },

    async handoffText(handoffId, secret, phone) {
      const a = await act("handoff_text", { handoff_id: handoffId, secret, phone });
      return { last4: str(a.last4) ?? "" };
    },

    async handoffStatus(handoffId) {
      const a = await act("handoff_status", { handoff_id: handoffId });
      const status = str(a.status);
      const known = ["waiting", "opened", "completed", "cancelled", "expired"] as const;
      return {
        status: known.find((k) => k === status) ?? "waiting",
        image_base64: str(a.image_base64) ?? undefined,
        mime_type: str(a.mime_type) ?? undefined,
        method: a.method === "drawn" || a.method === "uploaded" ? a.method : undefined,
      };
    },

    async handoffCancel(handoffId) {
      await act("handoff_cancel", { handoff_id: handoffId });
    },
  };
}

/** The load answer (§6.3) in the contract's shape. Missing keys read as their honest empty value. */
export function toLoadV2(a: Answer): SignerLoadV2 {
  const meRaw = isRecord(a.me) ? a.me : {};
  const meId = str(meRaw.id) ?? "";
  const actsFor = Array.isArray(meRaw.acts_for) ? meRaw.acts_for.filter((x): x is string => typeof x === "string") : [];
  const options = isRecord(a.settings) && isRecord(a.settings.signature_options) ? a.settings.signature_options : isRecord(a.signature_options) ? a.signature_options : {};
  const settings = isRecord(a.settings) ? a.settings : {};
  const branding = isRecord(a.branding) ? a.branding : {};
  const sender = isRecord(a.sender) ? a.sender : {};
  const organization = isRecord(a.organization) ? a.organization : {};
  const marks = isRecord(a.my_marks) ? a.my_marks : {};
  const progress = isRecord(a.progress) ? a.progress : {};
  const consent = isRecord(a.consent) ? a.consent : null;
  const formView = settings.form_view === "available" || settings.form_view === "default" ? settings.form_view : "off";
  return {
    envelope: isRecord(a.envelope) ? a.envelope : {},
    sender: { name: str(sender.name) ?? "The sender", email: str(sender.email) },
    organization: {
      id: str(organization.id) ?? "",
      name: str(organization.name) ?? str(branding.name) ?? str(branding.organization_name) ?? "AI Matrx",
      logo_url: str(organization.logo_url) ?? str(branding.logo_url),
    },
    me: {
      ...meRaw,
      id: meId,
      color_index: typeof meRaw.color_index === "number" ? meRaw.color_index : 0,
      acts_for: actsFor.length > 0 ? actsFor : meId ? [meId] : [],
      field_values: readValues(meRaw.field_values),
    },
    my_marks: {
      signature_base64: str(marks.signature_base64),
      initials_base64: str(marks.initials_base64),
      mime_type: str(marks.mime_type) ?? "image/png",
    },
    other_signers: (Array.isArray(a.other_signers) ? a.other_signers : []).filter(isRecord).map((o, i) => ({
      id: str(o.id) ?? `other-${i}`,
      order: typeof o.order === "number" ? o.order : i + 1,
      role: str(o.role) ?? "signer",
      status: str(o.status) ?? "",
      name: str(o.name),
      color_index: typeof o.color_index === "number" ? o.color_index : i + 1,
    })),
    others_filled: (Array.isArray(a.others_filled) ? a.others_filled : []).filter(isRecord).flatMap((o) => {
      const id = str(o.field_id);
      const by = str(o.signer_id);
      const v = o.v;
      return id && by && (typeof v === "string" || typeof v === "boolean" || v === null) ? [{ field_id: id, signer_id: by, v }] : [];
    }),
    others_marks: isRecord(a.others_marks)
      ? Object.fromEntries(
          Object.entries(a.others_marks).flatMap(([id, m]) =>
            isRecord(m) ? [[id, { signature_base64: str(m.signature_base64), initials_base64: str(m.initials_base64) }]] : [],
          ),
        )
      : {},
    documents: (Array.isArray(a.documents) ? a.documents : []).filter(isRecord).map((d, i) => ({
      id: str(d.id) ?? `doc-${i}`,
      name: str(d.name) ?? "Document",
      position: typeof d.position === "number" ? d.position : i,
      content_hash: str(d.content_hash) ?? "",
      page_count: typeof d.page_count === "number" ? d.page_count : null,
      mime_type: str(d.mime_type),
      field_map: isRecord(d.field_map) ? d.field_map : {},
    })),
    consent:
      consent && str(consent.disclosure_id)
        ? {
            disclosure_id: str(consent.disclosure_id) ?? "",
            version: str(consent.version) ?? "",
            title: str(consent.title) ?? "Electronic record and signature disclosure",
            text: str(consent.text) ?? "",
          }
        : null,
    settings: {
      signature_options: {
        typed: bool(options.typed, true),
        drawn: bool(options.drawn, true),
        uploaded: bool(options.uploaded, false),
        phone: bool(options.phone, false),
      },
      fill_all_allowed: bool(settings.fill_all_allowed, false),
      delegation_allowed: bool(settings.delegation_allowed, false),
      message_to_sender_allowed: bool(settings.message_to_sender_allowed, false),
      form_view: formView,
      date_format_default: str(settings.date_format_default) ?? "MM/DD/YYYY",
    },
    progress: {
      required_total: typeof progress.required_total === "number" ? progress.required_total : 0,
      required_done: typeof progress.required_done === "number" ? progress.required_done : 0,
    },
    remaining_after_me: typeof a.remaining_after_me === "number" ? a.remaining_after_me : 0,
  };
}
