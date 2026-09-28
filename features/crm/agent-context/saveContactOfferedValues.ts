/**
 * The MAPPED-ONLY offered values of Provision `crm.save_contact_selection`
 * (mandate `crm.save_contact`, declared `pass_by_name=False` in aidream
 * `client_mandates.py`) — the reviewed contact fields as separate names, and
 * the page the selection was saved from.
 *
 * They ride `variables` beside `selection` / `hints` / `origin`, which are
 * unchanged. On the mandate door the server drops mapped-only values on the
 * default pin and delivers them only where a binding's consumption map names
 * them, so no current Holder's payload changes.
 *
 * A blank is missing, never an answer: every empty field is omitted.
 * `text_before` / `text_after` are not held by this flow (the selection
 * arrives without its surroundings) and are never invented.
 */

import type { CrmSaveContactSelectionOffer } from "@/types/python-generated/provision-offers";
import type { ParsedContactSelection } from "./parseContactSelection";

/** Where the dialog was opened — read once from the page it opened on. */
export interface SaveContactPageFacts {
  pagePath?: string | null;
  pageUrl?: string | null;
  sourceTitle?: string | null;
}

type MappedKeys =
  | "contact_name"
  | "party_kind"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "company_domain"
  | "headline"
  | "page_path"
  | "page_url"
  | "source_title";

export function saveContactOfferedValues(
  draft: ParsedContactSelection,
  page: SaveContactPageFacts,
): Pick<CrmSaveContactSelectionOffer, MappedKeys> {
  const pairs: Array<[MappedKeys, string | null | undefined]> = [
    ["contact_name", draft.name],
    ["party_kind", draft.kind],
    ["first_name", draft.firstName],
    ["last_name", draft.lastName],
    ["email", draft.email],
    ["phone", draft.phone],
    ["company_domain", draft.domain],
    ["headline", draft.headline],
    ["page_path", page.pagePath],
    ["page_url", page.pageUrl],
    ["source_title", page.sourceTitle],
  ];
  const out: Partial<Record<MappedKeys, string>> = {};
  for (const [key, value] of pairs) {
    const v = typeof value === "string" ? value.trim() : "";
    if (v) out[key] = v;
  }
  return out satisfies Partial<CrmSaveContactSelectionOffer>;
}
