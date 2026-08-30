// features/scopes/service/entityRows.ts
//
// HOST WIRING (W5 swap, 2026-08-29): generic registry-convention row
// create/rename lives in `@ai-matrx/associations/core`
// (createEntityRowsService — schema/table/titleColumn + owner/org
// conventions, title-cache priming, never writes edges). Bound here to the
// host store under the historical free-function names.

import type {
  CreateEntityRowArgs,
  EntityRowResult,
} from "@ai-matrx/associations/core";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export type { CreateEntityRowArgs, EntityRowResult } from "@ai-matrx/associations/core";

export function createEntityRow(
  token: EntityTypeToken,
  args: CreateEntityRowArgs,
): Promise<EntityRowResult> {
  return getAssociationsStore().entityRows.createEntityRow(token, args);
}

export function renameEntityRow(
  token: EntityTypeToken,
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return getAssociationsStore().entityRows.renameEntityRow(token, id, title);
}
