// features/scopes/service/associationGuards.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the token+UUID pre-flight wall
// (writes-strict against the generated vocabulary, loud legacy-alias
// recovery) lives in `@ai-matrx/associations/core`. The package services run
// their own guard instance internally; what remains importable here is a
// host-bound guard instance for any residual direct use.

import { createAssociationGuards } from "@ai-matrx/associations/core";
import { associationsErrorSink } from "@/features/scopes/host/errorSink";

export { firstError } from "@ai-matrx/associations/core";
// THE HISTORICAL `isUuid` ALIAS IS GONE (2026-09-12). The predicate moved to
// `@ai-matrx/kit/uuid` as `isUuidShape` on 2026-09-07 and this line kept the
// old name alive for ~20 callers — which is the class a sixth adversarial
// review named: a second name for a collapsed export puts every one of its
// call sites outside the guards that judge that export, and it hides WHICH
// question is being asked (`isUuidShape` is the lax "id or slug?"; the strict
// validation door is `isRfc4122Uuid`). Every caller imports from kit directly.

const guards = createAssociationGuards(associationsErrorSink);

export const checkUuid = guards.checkUuid;
export const checkUuidArray = guards.checkUuidArray;
export const checkToken = guards.checkToken;
export const normalizeEntityToken = guards.normalizeEntityToken;
