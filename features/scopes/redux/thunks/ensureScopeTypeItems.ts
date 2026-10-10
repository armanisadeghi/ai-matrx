// features/scopes/redux/thunks/ensureScopeTypeItems.ts
//
// A scope type's context fields into the holder's catalog, through `scopeDoors().fields`. The
// System Context items ride the same catalog under `SYSTEM_ITEMS_KEY` (read through
// `scopeDoors().systemItems`), shown as fields of that pseudo-type.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RecordsResult } from "@ai-matrx/records";
import type { ContextField, ContextFieldKind, ContextSensitivity, SystemContextItem } from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { SYSTEM_ITEMS_KEY } from "@/features/scopes/constants/contextItems";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

/** Status bookkeeping only: one read per type while it is loading. */
const inFlight = new Map<string, Promise<void>>();

export function ensureScopeTypeItems(scopeTypeId: string, opts: { refresh?: boolean } = {}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const entry = getState().scopesTree.contextItemsByTypeId[scopeTypeId];
    if (!opts.refresh) {
      if (entry?.status === "ready") return;
      const p = entry?.status === "loading" ? inFlight.get(scopeTypeId) : undefined;
      if (p) return p;
    }
    dispatch(scopesActions.contextItemsFetchPending({ scopeTypeId }));
    const promise = (async () => {
      try {
        const res = scopeTypeId === SYSTEM_ITEMS_KEY ? await systemItemsAsFields() : await scopeDoors().fields([scopeTypeId]);
        if (!res.ok) {
          dispatch(scopesActions.contextItemsFetchRejected({ scopeTypeId, error: res.error.message }));
          return;
        }
        const items = [...res.data].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
        dispatch(scopesActions.contextItemsFetchFulfilled({ scopeTypeId, items }));
      } finally {
        inFlight.delete(scopeTypeId);
      }
    })();
    inFlight.set(scopeTypeId, promise);
    return promise;
  };
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/** A System Context item shown as a field of the `SYSTEM_ITEMS_KEY` pseudo-type. */
function systemItemAsField(r: SystemContextItem, index: number): ContextField {
  return {
    id: str(r.id),
    scope_type_id: SYSTEM_ITEMS_KEY,
    organization_id: "",
    key: str(r.key),
    label: str(r.display_name, str(r.key)),
    description: str(r.description),
    kind: str(r.value_type, "string") as ContextFieldKind,
    type: "system",
    multi: false,
    format: null,
    config: { item_class: r.item_class ?? null },
    relation_target: null,
    sort: typeof r.sort_order === "number" ? r.sort_order : index,
    context_policy: "include",
    sensitivity: str(r.sensitivity, "public") as ContextSensitivity,
    source: "system",
    status: "active",
    status_note: null,
    category: null,
    tags: [],
    max_items: 0,
    custom_component: null,
    reference_source: null,
    allowed_scope_type_ids: null,
    allowed_reference_types: null,
    review_interval_days: null,
    depends_on: [],
    version: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

async function systemItemsAsFields(): Promise<RecordsResult<ContextField[]>> {
  const res = await scopeDoors().systemItems();
  return res.ok ? { ok: true, data: res.data.map(systemItemAsField) } : res;
}
