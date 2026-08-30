// features/scopes/service/categoriesService.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the `cat_*` chokepoint lives in
// `@ai-matrx/associations/core` (createCategoriesService); bound here to the
// host store under the historical name. Still the ONE `cat_*` chokepoint —
// no other file may call those RPCs.

import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export const categoriesService = getAssociationsStore().services.categories;
