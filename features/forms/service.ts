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
    thank_you?: { title: string; body?: string | null } | null;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
