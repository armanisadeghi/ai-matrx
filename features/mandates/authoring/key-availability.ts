"use client";

// features/mandates/authoring/key-availability.ts
//
// 🚨 IS THIS KEY FREE? — ASKED AS A QUESTION, ANSWERED AS A SENTENCE, AND
// NEVER AS A NAVIGATION (FIX-R14, 2026-09-08).
//
// An independent walker on production v0.4.1736 lost everything they had
// typed on `/administration/mandates/new`: the route changed under them into
// an EXISTING mandate's page, and their name and goal went into that record.
// The lesson is bigger than whatever moved the route: a creation form is the
// one screen where the person's work exists ONLY in the form, so
//
//   1. nothing this module learns may ever move the person (see `draft.ts`
//      for the other half — what they typed survives the route changing for
//      ANY reason), and
//   2. a key that is already taken is a REFUSAL ON THE FIELD naming the job
//      that holds it, with a door the person MAY choose — never a jump.
//
// The read is deliberately the plainest one that answers the question: one
// row, by key, live only. The authoritative answer is still the server's 409
// on POST /mandates (`MandateKeyConflict`); this probe exists so the person
// learns it while they can still cheaply change their mind, and its sentence
// is the same fact in the same words.

import { supabase } from "@/utils/supabase/client";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { adminMandateHref } from "../browse/url-compat";

/**
 * What the page knows about the typed key. `unknown` is a first-class answer:
 * a read that failed is NOT evidence the key is free, and saying "free" on a
 * failed read is exactly the silent-fallback the fourth law forbids.
 */
export type KeyAvailability =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "free" }
  | { status: "taken"; mandateKey: string; label: string; href: string }
  | { status: "unknown"; reason: string };

/**
 * The refusal a person reads, beside the key they typed. It names the job that
 * holds the key, and it says out loud that the page is not going to move them
 * and that their work is safe — because the defect this closes did both of the
 * opposite things.
 */
export function keyTakenSentence(mandateKey: string, label: string): string {
  return `That key is taken — "${mandateKey}" already names the live job ${label}. Pick a different key, or open that job in a new tab; either way nothing you have typed here is lost.`;
}

/** A read that could not answer says so, with the reason and what it means. */
export function keyUnknownSentence(mandateKey: string, reason: string): string {
  return `Whether "${mandateKey}" is free could not be checked: ${reason} You can still press Create — the server checks the key itself and refuses in the same words if it is taken.`;
}

/**
 * Ask whether a live mandate already holds this key. Pure I/O: it returns an
 * answer and does nothing else. It holds no router, takes no callback, and has
 * no side effect a caller could turn into a navigation.
 */
export async function probeMandateKey(
  mandateKey: string,
): Promise<KeyAvailability> {
  const key = mandateKey.trim();
  if (!key) return { status: "idle" };
  const { data, error } = await mandateDefinitions(supabase)
    .select("mandate_key, label")
    .eq("mandate_key", key)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { status: "unknown", reason: error.message };
  if (!data) return { status: "free" };
  return {
    status: "taken",
    mandateKey: data.mandate_key,
    label: data.label?.trim() || data.mandate_key,
    href: adminMandateHref(data.mandate_key),
  };
}
