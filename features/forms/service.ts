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
    theme?: { accent?: string | null; align?: "left" | "center" | null } | null;
    /**
     * What the person sees after sending. `redirect_url` is only ever present when it is a
     * secure page on the organization's own sites — `custom.form_public` drops it otherwise
     * (lane S7-PRIME), so the page can follow it without judging it again.
     */
    thank_you?: { title?: string | null; body?: string | null; redirect_url?: string | null } | null;
    submit_label?: string | null;
    questions?: PublicFormQuestion[];
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
  if (!UUID.test(formId)) return null;
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
  if (!UUID.test(formId)) return [];
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
  if (!UUID.test(formId) || secret.trim() === "") return null;
  const { data, error } = await storeDoors().rpc("form_draft_read", { p_form_id: formId, p_secret: secret });
  if (error) {
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as DraftRead | undefined) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
