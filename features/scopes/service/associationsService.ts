// features/scopes/service/associationsService.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the `assoc_*` / `conversation_file*` /
// `agent_resource_*` chokepoint now LIVES IN `@ai-matrx/associations/core`
// (createAssociationsService — behavior ported verbatim, incl. the
// file→conversation routing and pre-flight guards). This module binds it to
// the host store (`features/scopes/host/associationsStore.ts`) under the
// historical name so the existing import sites keep working.
//
// STILL THE ONE CHOKEPOINT RULE: no other file in this repo may call the
// `assoc_*` RPC families — they go through this service (or the store's
// cached add/remove/setTargets via the package hooks).
//
// NOTE: writes through THIS object do NOT touch the package cache the hooks
// render from. A surface that must stay fresh uses `useAssociations` /
// `useContainerLinks` (or `getAssociationsStore().add/remove/setTargets`).

import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export type {
  AddAssociationArgs,
  ConversationFileLink,
} from "@ai-matrx/associations/core";

export const associationsService =
  getAssociationsStore().services.associations;
