// features/window-panels/detail/detailTypeBinding.ts
//
// The `resolveType` port: THE record-type map for the Detail primitive is the
// item-presentation registry (`features/item-presentation/registry.tsx`),
// exposed through `resolveItemDetailType`. Every presentation entry binds
// this beside its shell — never at boot, because the map pulls the registry
// and the item frame (right-click menu, surface runtime) into its importer.

import { resolveItemDetailType } from "@/features/item-presentation/detail";

export const DETAIL_TYPE_BINDING = { resolveType: resolveItemDetailType } as const;
