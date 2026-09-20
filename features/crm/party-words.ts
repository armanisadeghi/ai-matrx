/**
 * THE ONE PLACE `crm.party_kind` BECOMES A WORD A PERSON READS.
 *
 * 🚨 N6 (VERIFY-U-P1-R5). `crm.party` holds 1,892 rows: 460 `person` and
 * 1,432 `organization` (read live 2026-09-18) — and every one of them was
 * labelled "Person", twice on screen, because the Detail primitive's
 * registration carries ONE label for the whole type. Meanwhile the same
 * `party_kind === "person" ? "Person" : "Company"` ternary was written out
 * eight times across the CRM (the list badge, the row-action menu target, the
 * item-presentation enrich, the peek, the call queue, the deal surfaces), so
 * "what do we call a company record" had eight answers and no home.
 *
 * This module is the home. The words are the ones the platform already shipped
 * — nothing is coined here:
 *   * **Person** is Arman's own ratified word (the vocabulary lexicon: "the
 *     standard table for a human as the organization sees them").
 *   * **Company** is the word the CRM list badge, the row-action menu and the
 *     item-presentation enrich already put on an `organization` row. The
 *     lexicon's **Organization** means the one owner type (the tenant), so it
 *     may never be reused for a CRM record.
 *   * **Contact** is the generic the CRM already uses for a party of either
 *     kind ("Open contact record", "Copy link to the contact",
 *     `crm.party.record_class = 'contact'`). It is what an UNKNOWN or
 *     not-yet-loaded kind reads — never "Person", which would be a lie about
 *     three rows in four.
 *
 * A live kind this file does not know reads the generic word rather than
 * guessing, and `PARTY_KIND_WORDS` is keyed by the closed `PARTY_KINDS`
 * vocabulary so a new kind added there is a type error here, not a silent
 * mislabel.
 */

import { PARTY_KINDS, type PartyKind } from "./types";

export interface PartyWords {
  /** "Person" · "Company" · "Contact" — the type chip, a header, a stand-in. */
  singular: string;
  /** "People" · "Companies" · "Contacts" — a list heading or a count. */
  plural: string;
}

/** The generic, for a kind we do not know and for a row that has not loaded. */
export const GENERIC_PARTY_WORDS: PartyWords = {
  singular: "Contact",
  plural: "Contacts",
};

/** One entry per live `crm.party.party_kind`; exhaustive over `PARTY_KINDS`. */
export const PARTY_KIND_WORDS: Record<PartyKind, PartyWords> = {
  person: { singular: "Person", plural: "People" },
  organization: { singular: "Company", plural: "Companies" },
};

function isPartyKind(value: unknown): value is PartyKind {
  return (
    typeof value === "string" && (PARTY_KINDS as readonly string[]).includes(value)
  );
}

/** Both words for a `party_kind`; the generic for an absent or unknown one. */
export function partyWords(kind: unknown): PartyWords {
  return isPartyKind(kind) ? PARTY_KIND_WORDS[kind] : GENERIC_PARTY_WORDS;
}

/** What to call ONE record of this kind. */
export function partyKindWord(kind: unknown): string {
  return partyWords(kind).singular;
}

/** What to call MANY records of this kind. */
export function partyKindWordPlural(kind: unknown): string {
  return partyWords(kind).plural;
}

/** True only for a kind this module recognises — never for `null`/unknown. */
export function isKnownPartyKind(kind: unknown): kind is PartyKind {
  return isPartyKind(kind);
}
