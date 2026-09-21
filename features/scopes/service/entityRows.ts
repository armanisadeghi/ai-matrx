// features/scopes/service/entityRows.ts
//
// THE GENERIC "CREATE A NEW ONE" — NOW OWNED BY THE PACKAGE, NOT BY THIS SEAM.
//
// HISTORY, because the shape of this file is the whole story. `@ai-matrx/associations`'s
// `createEntityRowsService` used to write the registered entity's backing table DIRECTLY
// (`dataSource.schema(info.schema).from(info.table).insert(...)`). That is the ONE generic
// write path on the platform — one call site, the reference picker's "create a new one",
// generic over every registry token — and the doors-only ruling (`platform` and `iam` are not
// client-writable; every write goes through a named SECURITY DEFINER door) therefore broke it
// SILENTLY for forty-four already-closed tables before anybody looked. The failure surfaces as
// a `42501` in a picker toast, which no release notices.
//
// DOORS-ONLY-3 bound these two names to `public.entity_row_create` / `public.entity_row_rename`
// HERE, at the host, because the doors had to exist before the package could call them. That
// was always meant to be temporary (THE SAME-SESSION LAW), and DOORS-ONLY-4 finished it: the
// package itself now calls the two doors, its `AssociationsDataSource` port has lost the
// `from`/`schema` table surfaces that existed only for the direct path, and its own suite
// proves the door is called and that nothing is written when it refuses.
//
// So this file is a thin adapter over the one package store again — the shape every other
// association operation in this app already has — rather than a second implementation of the
// same two RPC calls drifting beside the package's.
//
// 🚨 ONE REAL DEFECT FIXED IN THE MOVE. The previous host binding sent
// `p_organization_id: args.orgId ?? ""`, and `""` is not a uuid: with no organization the door
// answered `22P02 invalid input syntax for type uuid` instead of its own sentence ("name the
// organization this belongs to"). The package refuses the missing organization BEFORE the round
// trip, with a sentence a person can act on.

import type { CreateEntityRowArgs, EntityRowResult } from "@ai-matrx/associations/core";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export type { CreateEntityRowArgs, EntityRowResult } from "@ai-matrx/associations/core";

export async function createEntityRow(
  token: EntityTypeToken,
  args: CreateEntityRowArgs,
): Promise<EntityRowResult> {
  return getAssociationsStore().entityRows.createEntityRow(token, args);
}

export async function renameEntityRow(
  token: EntityTypeToken,
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return getAssociationsStore().entityRows.renameEntityRow(token, id, title);
}
