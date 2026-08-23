import type { RefFieldSpec } from "@/features/directive-catalog/buildEnvelope";
import type { NounDirectives } from "@/features/directive-catalog/types";
import {
  getEntityInfo,
  tryGetEntityInfoByTable,
  type EntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import {
  isEntityTypeToken,
  type EntityTypeToken,
} from "@/types/generated/entity-types.generated";

/** Compound-reference ids whose owning record is unambiguous. */
const FIELD_TOKEN: Readonly<Partial<Record<string, EntityTypeToken>>> = {
  context_item_id: "context_item",
  document_id: "udt_document",
  file_id: "file",
  list_id: "structured_list",
  scope_id: "scope",
  table_id: "dataset",
  transcript_id: "transcript",
  workbook_id: "workbook",
};

function listable(info: EntityInfo | null): EntityInfo | null {
  return info?.canListCandidates ? info : null;
}

function infoForTable(tableRef: string): EntityInfo | null {
  const separator = tableRef.indexOf(".");
  const schema = separator === -1 ? "public" : tableRef.slice(0, separator);
  const table = separator === -1 ? tableRef : tableRef.slice(separator + 1);
  return listable(tryGetEntityInfoByTable(schema, table));
}

/**
 * Resolve the real entity collection that can supply one identity field.
 * Ambiguous ids deliberately return null: manual entry remains available, but
 * the UI never searches a plausible-looking yet incorrect table.
 */
export function identityFieldPickerInfo(
  noun: NounDirectives,
  specs: RefFieldSpec[],
  fieldKey: string,
): EntityInfo | null {
  const knownToken = FIELD_TOKEN[fieldKey];
  if (knownToken) return listable(getEntityInfo(knownToken));

  if (specs.length === 1) {
    if (isEntityTypeToken(noun.noun)) {
      const nounInfo = listable(getEntityInfo(noun.noun));
      if (nounInfo) return nounInfo;
    }
    return infoForTable(noun.table);
  }

  const tokenCandidate = fieldKey.endsWith("_id") ? fieldKey.slice(0, -3) : "";
  if (isEntityTypeToken(tokenCandidate)) {
    return listable(getEntityInfo(tokenCandidate));
  }

  return null;
}
