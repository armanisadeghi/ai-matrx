// features/scopes/service/associationGuards.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the token+UUID pre-flight wall
// (writes-strict against the generated vocabulary, loud legacy-alias
// recovery) lives in `@ai-matrx/associations/core`. The package services run
// their own guard instance internally; what remains importable here is the
// pure `isUuid` predicate the app's non-association callers use, plus a
// host-bound guard instance for any residual direct use.

import { createAssociationGuards } from "@ai-matrx/associations/core";
import { associationsErrorSink } from "@/features/scopes/host/errorSink";

export { firstError } from "@ai-matrx/associations/core";
// `isUuid` moved to `@ai-matrx/kit/uuid` as `isUuidShape` on 2026-09-07
// (associations 0.8.0, C28). Aliased here so the ~20 host callers that speak
// the historical `isUuid` name keep working; NEW code should import
// `isUuidShape` (lax, "id or slug?") or `isRfc4122Uuid` (strict, a validation
// door) from kit directly and say which question it is asking.
export { isUuidShape as isUuid } from "@ai-matrx/kit/uuid";

const guards = createAssociationGuards(associationsErrorSink);

export const checkUuid = guards.checkUuid;
export const checkUuidArray = guards.checkUuidArray;
export const checkToken = guards.checkToken;
export const normalizeEntityToken = guards.normalizeEntityToken;
