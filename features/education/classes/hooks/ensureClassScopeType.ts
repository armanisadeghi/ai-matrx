// features/education/classes/hooks/ensureClassScopeType.ts
//
// The ONE seeder for the per-org scope types the class layer owns beside the
// class itself (units: `class-part`, tests: `class-test`). Resolved by slug,
// never label (the org may rename it); created once per org through the
// canonical scope thunks.

import type { AppDispatch, AppStore } from "@/lib/redux/store";
import {
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { createScopeType } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { unwrapScopesRpc } from "@/features/scopes/types";

export interface ClassScopeTypeSeed {
  labelSingular: string;
  labelPlural: string;
  icon: string;
  color: string;
  description: string;
}

/** The id of the org's scope type with this slug, creating it on first use. */
export async function ensureClassScopeType(
  dispatch: AppDispatch,
  store: AppStore,
  org: string,
  slug: string,
  seed: ClassScopeTypeSeed,
): Promise<string> {
  if (!selectScopeTypesLoadedForOrg(store.getState(), org))
    await dispatch(ensureScopeTree());
  const existing = selectScopeTypesByOrg(store.getState(), org).find(
    (t) => t.slug === slug,
  );
  if (existing) return existing.id;
  const created = await dispatch(
    createScopeType({
      org_id: org,
      label_singular: seed.labelSingular,
      label_plural: seed.labelPlural,
      icon: seed.icon,
      color: seed.color,
      description: seed.description,
      slug,
    }),
  ).then(unwrapScopesRpc);
  return created.id;
}
