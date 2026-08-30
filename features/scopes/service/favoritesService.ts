// features/scopes/service/favoritesService.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the `ues_*` chokepoint (favorites /
// pinned / hidden / recents) lives in `@ai-matrx/associations/core`
// (createFavoritesService — favoritesService + favoritesCore collapsed into
// one implementation there); bound here to the host store under the
// historical name. Still the ONE `ues_*` chokepoint on the client — server
// component readers inject their own client via ./favoritesCore.

import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export type { UserStateKind } from "@ai-matrx/associations";

export const favoritesService = getAssociationsStore().favorites;
