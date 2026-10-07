import "server-only";

// features/forms/service.ts — THE PUBLIC FORM'S ONLY DATA ACCESS.
//
// PRODUCTS row 1: *"Make me an intake form for new patients that texts me when
// one arrives."* This module is the app's whole half of that — two doors, both
// server-lane, and nothing else anywhere in the repo touches them.
//
// WHY THE SERVER IS THE CALLER, AND NOT THE BROWSER.
// --------------------------------------------------
// `custom.form_public` and `custom.form_submit` are declared `server_only` in
// `platform.client_callable_door`, beside `custom.anon_write`, for the reason
// that door's own row gives: the ORIGIN of a request and the address of the
// client are things the server knows and a browser can only assert. A browser
// handing a door its own origin and its own rate-limit bucket would be counting
// itself. Schema `custom` stays revoked from `anon`, which is the posture
// W4-ANON chose; the grant these two doors hold is to `service_role`, the role
// behind `SUPABASE_SECRET_KEY`, which never leaves this process.
//
// WHAT THE PUBLIC READ CAN AND CANNOT SEE. `custom.form_public` answers the
// form's own words and the Field definitions of exactly the keys it exposes. It
// reads NO record of the table it writes into — not one row, not a count, not an
// id. A form that does not exist and one that was never published answer with ZERO
// ROWS, so the link cannot be used to learn that anything is there. That is the
// 404, and it is `iam.resolve_publish_binding`'s own precedent.
//
// A PUBLISHED form whose organization has switched the record store OFF is NOT
// one of those, and STORE-OFF (2026-09-22) stopped it pretending to be: the
// holder of that link was GIVEN it by the organization, so there is nothing left
// to hide and a 404 only made the organization's own switch look like our product
// losing their page. It answers `state: "unavailable"` and the store's sentence.

import { cache } from "react";

import { typedAnswersFor } from "@/features/unified-data/typedAnswers";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { PortalStyle } from "@/features/portals/service";

/**
 * THE STORE'S SCHEMA IS NOT IN `types/database.types.ts`, AND THAT IS CORRECT.
 *
 * Those types are generated from the schemas the app's own clients are typed
 * against, and schema `custom` is deliberately not one of them: the record store
 * is reached through its doors and through `@ai-matrx/records`, never as tables
 * a screen selects from. This module is the app's ONLY other reach into it — two
 * server-lane doors — so the cast happens HERE, once, named, rather than being
 * repeated wherever somebody needs it next.
 *
 * What it does NOT do is soften anything: the doors are SECURITY DEFINER and
 * make their own decisions, and the two result shapes are declared below in
 * full, so a door that changes its answer shows up as a type error here rather
 * than as a wrong screen.
 */
type StoreCaller = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string; hint?: string | null } | null;
  }>;
};

function storeDoors(): StoreCaller {
  return (createAdminClient() as unknown as { schema(name: string): StoreCaller }).schema("custom");
}

/** One question, in the form's own words, pointing at one Field by key. */
export interface PublicFormQuestion {
  field: string;
  ask?: string | null;
  help?: string | null;
  required?: boolean | null;
  /** The question's condition, as the store holds it. Answered by the store, never here. */
  showIf?: Record<string, unknown> | null;
  /** TYPEFORM-DUP: logic jumps and points, as the store holds them. Judged by the store's route. */
  jumps?: Array<Record<string, unknown>> | null;
  points?: Record<string, number> | null;
}

/** What `custom.form_public` answers, exactly. */
export interface PublicForm {
  form_id: string;
  organization_id: string;
  table_id: string;
  title: string;
  presentation: {
    intro?: string | null;
    flow?: "one-at-a-time" | "single-page" | null;
    theme?: {
      accent?: string | null;
      align?: "left" | "center" | null;
      font?: string | null;
      button?: string | null;
      background?: string | null;
      /** TYPEFORM-DUP: the background picture, resolved by `custom.form_public` to a public address. */
      background_url?: string | null;
    } | null;
    /** TYPEFORM-DUP: the welcome screen; its picture resolved to `picture_url`. */
    welcome?: Record<string, unknown> | null;
    /** TYPEFORM-DUP: the endings; pictures resolved, redirects only while still the organization's own. */
    endings?: Array<Record<string, unknown>> | null;
    /** TYPEFORM-DUP: names read from the link and kept on the submission, never shown. */
    hidden_fields?: string[] | null;
    /**
     * What the person sees after sending. `redirect_url` is only ever present when it is a
     * secure page on the organization's own sites — `custom.form_public` drops it otherwise
     * (lane S7-PRIME), so the page can follow it without judging it again.
     */
    thank_you?: { title?: string | null; body?: string | null; redirect_url?: string | null } | null;
    submit_label?: string | null;
    questions?: PublicFormQuestion[];
    /**
     * MAKE-HOME W5: the look a stranger sees, RESOLVED by the store (`custom._form_look` →
     * `custom._portal_style`): the organization's look under the form's own colour, logo and
     * cover — public addresses, never file ids.
     */
    look?: PortalStyle | null;
  };
  /** The exposed Fields as the store holds them, each with its own id. */
  fields: Array<Record<string, unknown>>;
  honeypot_key: string | null;
  /**
   * `unavailable` is STORE-OFF's: the form is published and the link is real, but its
   * organization has switched the record store off, so the door answers a sentence naming
   * that instead of the zero rows it used to (which the page turned into a 404).
   */
  state: "open" | "closed" | "full" | "unavailable";
  message: string | null;
}

/**
 * The form behind a public link, or `null` — which is the 404 and is the same
 * answer for missing, unpublished and store-switched-off.
 *
 * `cache()` dedupes it within one request, because `generateMetadata` and the
 * page itself both want it and a public link should cost one round trip.
 */
export const publicForm = cache(async (formId: string): Promise<PublicForm | null> => {
  if (!isUuidShape(formId)) return null;
  const { data, error } = await storeDoors().rpc("form_public", { p_form_id: formId });
  if (error) {
    // NOTHING FAILS SILENTLY. A door that refused is not an absent form: a 404
    // here would tell the person their link is wrong when it is ours that is.
    throw new Error(`custom.form_public refused: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicForm | undefined) ?? null;
});

/** What a submission answers. `state` is the store's own word, never derived here. */
export interface SubmitOutcome {
  submission_id: string | null;
  record_id: string | null;
  state: "accepted" | "held" | "closed" | "full" | "too_many";
  message: string | null;
}

/**
 * Send one answer. The ORIGIN and the BUCKET come from the request the server is
 * holding — never from the body — which is the whole reason this door is
 * server-lane. The bucket is a coarse client identifier: the forwarded address
 * when the platform gives us one, and the origin otherwise, so a form behind a
 * proxy that strips it is rate-limited per site rather than not at all.
 */
export async function submitPublicForm(args: {
  formId: string;
  origin: string;
  bucket: string;
  values: Record<string, unknown>;
  honeypot: string | null;
  clientKey: string | null;
}): Promise<SubmitOutcome> {
  const { data, error } = await storeDoors().rpc("form_submit", {
    p_form_id: args.formId,
    p_origin: args.origin,
    p_payload: args.values,
    p_bucket: args.bucket,
    p_honeypot: args.honeypot,
    p_client_key: args.clientKey,
  });
  if (error) {
    // THE STORE'S OWN SENTENCE, CARRIED WHOLE. `custom.form_submit` refuses a key
    // the form does not ask for BY NAME and names every missing required answer,
    // so the person sees which question to fix rather than one generic error.
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SubmitOutcome | undefined) ?? { submission_id: null, record_id: null, state: "held", message: null };
}

/** One question's answer from `custom.form_public_asks`. */
export interface PublicAsk {
  field_key: string;
  asked: boolean;
  /** False when the condition is undecided or could not be worked out — the question is asked. */
  decided: boolean;
  /** The store's own sentence when it could not work the condition out. */
  said: string | null;
}

/**
 * WHICH QUESTIONS ARE ASKED NEXT, given the answers so far (lane FORMS-FIX-1).
 *
 * Each question's own condition is answered by the STORE — `custom.form_public_asks`
 * hands it to `custom.rule_eval`, the evaluator the signed-in form uses — so a
 * stranger's form branches exactly as the owner's preview does. Nothing is
 * decided here and nothing in the browser. Zero rows means the same as
 * `publicForm`'s null: missing, unpublished, closed or switched off.
 */
export async function publicFormAsks(formId: string, values: Record<string, unknown>): Promise<PublicAsk[]> {
  if (!isUuidShape(formId)) return [];
  const { data, error } = await storeDoors().rpc("form_public_asks", {
    p_form_id: formId,
    p_values: values,
  });
  if (error) {
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  return (Array.isArray(data) ? data : []) as PublicAsk[];
}

/**
 * PREFILL BY LINK (lane S7-PRIME). `/f/<id>?referring_clinic=Harbor+Sports+Medicine` starts
 * the form with that answer in its question. Only keys the form actually ASKS are taken,
 * each coerced to its Field's kind exactly as a submitted answer is (a "yes" for a checkbox,
 * a number for a number); a parameter the form does not ask, or one that cannot be that
 * kind, is left out rather than refusing the page — the person following a link did not
 * write it. What is kept is an ordinary answer: shown, changeable, and handed to the same
 * asks door as anything typed, so the questions that depend on it branch.
 *
 * Reserved: `resume` never names a question (it is the saved place, and it travels in the
 * fragment, never here).
 */
export function prefillFromLink(
  form: PublicForm,
  params: Record<string, string | string[] | undefined>,
): { answers: Record<string, unknown>; ignored: string[] } {
  const asked = new Set((form.presentation?.questions ?? []).map((q) => q.field));
  const raw: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const one = Array.isArray(value) ? value[value.length - 1] : value;
    if (!asked.has(key) || one === undefined || one === "") {
      if (key !== "resume") ignored.push(key);
      continue;
    }
    raw[key] = one;
  }
  const typed = typedAnswersFor(form.fields, raw);
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(typed.values)) {
    if (!typed.byKey[key]) answers[key] = value;
  }
  ignored.push(...Object.keys(typed.byKey));
  return { answers, ignored };
}

/** What `custom.form_draft_save` answers. `draft_secret` is handed out ONCE, on the first save. */
export interface DraftSaved {
  draft_secret: string | null;
  saved_at: string | null;
  expires_at: string | null;
  state: "saved" | "submitted" | "closed" | "full" | "too_many";
  message: string | null;
}

/**
 * KEEP A STRANGER'S PLACE (lane S7-PRIME). The answers so far, under a secret only her
 * browser (or the link she copied) holds. Never a record and never a submission — that
 * is `custom.form_submit`'s alone, and it uses the place up when she sends. The bucket
 * and origin come from the request, as for sending.
 */
export async function saveFormDraft(args: {
  formId: string;
  answers: Record<string, unknown>;
  secret: string | null;
  bucket: string;
  origin: string;
}): Promise<DraftSaved> {
  const { data, error } = await storeDoors().rpc("form_draft_save", {
    p_form_id: args.formId,
    p_answers: args.answers,
    p_secret: args.secret,
    p_bucket: args.bucket,
    p_origin: args.origin,
  });
  if (error) {
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("custom.form_draft_save answered nothing.");
  return row as DraftSaved;
}

/** What `custom.form_draft_read` answers. Zero rows (null here) is the page's own 404. */
export interface DraftRead {
  answers: Record<string, unknown> | null;
  saved_at: string | null;
  expires_at: string | null;
  state: "found" | "submitted" | "expired" | "closed" | "not_found";
  message: string | null;
}

/** WHERE WAS I. The saved place behind a secret, with the store's sentence when it is gone. */
export async function readFormDraft(formId: string, secret: string): Promise<DraftRead | null> {
  if (!isUuidShape(formId) || secret.trim() === "") return null;
  const { data, error } = await storeDoors().rpc("form_draft_read", { p_form_id: formId, p_secret: secret });
  if (error) {
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as DraftRead | undefined) ?? null;
}



/** TYPEFORM-DUP: the store's route through a public form (`custom.form_public_route`). */
export interface PublicRoute {
  asks: Array<{ field_key: string; asked: boolean; decided: boolean; said: string | null }>;
  ending: string | null;
  score: number | null;
}

/**
 * WHICH QUESTIONS ARE ASKED, WHICH ENDING IS REACHED AND THE SCORE (lane TYPEFORM-DUP) — showIf and
 * logic jumps walked by the STORE (`custom._form_route`), the same walk `custom.form_submit` checks
 * required answers against. Null is `publicForm`'s null: missing, unpublished, closed or off.
 */
export async function publicFormRoute(formId: string, values: Record<string, unknown>): Promise<PublicRoute | null> {
  if (!isUuidShape(formId)) return null;
  const { data, error } = await storeDoors().rpc("form_public_route", { p_form_id: formId, p_values: values });
  if (error) {
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  return (data as PublicRoute | null) ?? null;
}

/**
 * COUNT A VISIT, HONESTLY (lane TYPEFORM-DUP). `view` when the page opens, `start` at the first
 * answer, `reach` as each question is shown — keyed by a random per-visit key the page holds in
 * memory (the store keeps only its hash). No cookie and no third party; `custom.form_results` reads it.
 */
export async function markFormVisit(args: {
  formId: string;
  visit: string;
  event: "view" | "start" | "reach";
  field: string | null;
}): Promise<string> {
  if (!isUuidShape(args.formId)) return "ignored";
  const { data, error } = await storeDoors().rpc("form_visit", {
    p_form_id: args.formId,
    p_visit: args.visit,
    p_event: args.event,
    p_field: args.field,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "ignored");
}

/**
 * TYPEFORM-2: may this client address add one more visit count to this form this minute? One hit
 * from the store's anonymous rate window (`custom.form_visit_admit`, knob forms/visit_rate_per_minute).
 */
export async function admitFormVisit(formId: string, bucket: string): Promise<boolean> {
  if (!isUuidShape(formId)) return true;
  const { data, error } = await storeDoors().rpc("form_visit_admit", { p_form_id: formId, p_bucket: bucket });
  if (error) throw new Error(error.message);
  return data !== false;
}

/** TYPEFORM-2: how a published form is drawn — the form's own override over the organization's knob. */
export interface PublicFormOptions {
  show_owner_header: boolean;
  choice_auto_advance: boolean;
}

export async function publicFormOptions(formId: string): Promise<PublicFormOptions> {
  const fallback: PublicFormOptions = { show_owner_header: true, choice_auto_advance: true };
  if (!isUuidShape(formId)) return fallback;
  const { data, error } = await storeDoors().rpc("form_public_options", { p_form_id: formId });
  if (error) throw new Error(`custom.form_public_options refused: ${error.message}`);
  const row = (data ?? null) as Partial<PublicFormOptions> | null;
  return {
    show_owner_header: row?.show_owner_header !== false,
    choice_auto_advance: row?.choice_auto_advance !== false,
  };
}
