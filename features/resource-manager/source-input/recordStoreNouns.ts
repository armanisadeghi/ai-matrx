/**
 * What a picked table / pick list is called on its card. The names are the vocabulary's (Table, Pick
 * list — never Dataset / Structured List) and match `platform.entity_types.label` for both tokens;
 * the bundled entity vocabulary does not carry these two tokens, so a card cannot look them up there.
 */
export const RECORD_STORE_NOUN: Record<string, string> = {
  dataset: "Table",
  structured_list: "Pick list",
};
