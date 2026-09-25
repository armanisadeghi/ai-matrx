// features/scopes/redux/thunks/ensureScopeTypeItems.ts
//
// Per-scope-type context-item CATALOG fetch (the item definitions, not
// per-scope values — those are `ensureContextValues`). Lazy: only when a
// consumer asks (the quick-assign target picker, etc.). No-refetch unless
// `refresh: true`. Stored sorted by sort_order then display_name, matching
// how item catalogs render everywhere.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ContextItemRow, ScopesRpcResult } from "@/features/scopes/types";
import { SYSTEM_ITEMS_KEY } from "@/features/scopes/constants/contextItems";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export function ensureScopeTypeItems(
  scopeTypeId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const entry = getState().scopesTree.contextItemsByTypeId[scopeTypeId];

    if (!refresh) {
      if (entry?.status === "ready") return;
      if (entry?.status === "loading") {
        const p = inFlight.get(scopeTypeId);
        if (p) return p;
      }
    }

    dispatch(scopesActions.contextItemsFetchPending({ scopeTypeId }));

    const promise = (async () => {
      try {
        const res =
          scopeTypeId === SYSTEM_ITEMS_KEY
            ? await listSystemItemsAsCatalog()
            : await scopesService.listContextItems(scopeTypeId);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.contextItemsFetchRejected({
              scopeTypeId,
              error: res.error.message,
            }),
          );
        } else {
          const items = [...res.data.items].sort(
            (a, b) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
              a.display_name.localeCompare(b.display_name),
          );
          dispatch(
            scopesActions.contextItemsFetchFulfilled({ scopeTypeId, items }),
          );
        }
      } finally {
        inFlight.delete(scopeTypeId);
      }
    })();

    inFlight.set(scopeTypeId, promise);
    return promise;
  };
}

/**
 * The System Context catalog (`SYSTEM_ITEMS_KEY`) in the catalog row shape:
 * global public facts with no scope type, each stamped with the sentinel and
 * its `system_item_class`. Same loader, same cache, same selectors.
 */
async function listSystemItemsAsCatalog(): Promise<
  ScopesRpcResult<{ items: ContextItemRow[] }>
> {
  const res = await scopesService.listSystemContextItems();
  if (isScopesRpcErr(res)) return res;
  const items = res.data.items.map(
    (r) =>
      ({
        id: r.id,
        scope_type_id: SYSTEM_ITEMS_KEY,
        key: r.key,
        display_name: r.display_name,
        description: r.description ?? "",
        category: null,
        value_type: r.value_type,
        fetch_hint: "always",
        sensitivity: r.sensitivity,
        status: "active",
        tags: [],
        sort_order: r.sort_order ?? 0,
        system_item_class: r.item_class,
      }) as unknown as ContextItemRow,
  );
  return { ok: true, data: { items } };
}
