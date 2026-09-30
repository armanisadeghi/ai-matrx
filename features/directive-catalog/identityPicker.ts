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
} from "@ai-matrx/associations";

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

  return tokenFromIdKey(fieldKey);
}

/**
 * `<token>_id` → that token, and `parent_<token>_id` → that token (a task's
 * `parent_task_id` is a task). Anything else is ambiguous and returns null.
 */
function tokenFromIdKey(fieldKey: string): EntityInfo | null {
  if (!fieldKey.endsWith("_id")) return null;
  const stem = fieldKey.slice(0, -3);
  for (const candidate of [stem, stem.replace(/^parent_/, "")]) {
    if (isEntityTypeToken(candidate)) return listable(getEntityInfo(candidate));
  }
  return null;
}

/**
 * The record collection behind an id field of a WRITE payload (create /
 * update / delete item), so the form offers a search instead of an id box.
 * `id` itself is the noun's own record. Same rules as identity fields — an
 * ambiguous key returns null and stays a plain text field, never a search over
 * a plausible-looking but wrong table.
 */
export function payloadFieldEntityInfo(
  fieldKey: string,
  nounToken: string | null,
): EntityInfo | null {
  if (fieldKey === "id") {
    return nounToken && isEntityTypeToken(nounToken)
      ? listable(getEntityInfo(nounToken))
      : null;
  }
  const knownToken = FIELD_TOKEN[fieldKey];
  if (knownToken) return listable(getEntityInfo(knownToken));
  return tokenFromIdKey(fieldKey);
}
