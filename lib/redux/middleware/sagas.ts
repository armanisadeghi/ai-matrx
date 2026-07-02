import { call, put, takeEvery, all } from "redux-saga/effects";
import { extractErrorMessage } from "@/utils/errors";
import type {
  FetchOneThunkArgs,
  FeatureName,
  PaginatedResponse,
} from "@/types/reduxTypes";
import {
  fetchWithFk,
  fetchWithIfk,
  fetchWithFkIfk,
  fetchCustomRels,
} from "@/lib/redux/api";
import { createFeatureActions } from "@/lib/redux/actions/featureActions";
import * as z from "zod";

// Maps the thunk-level `FetchOneThunkArgs` payload (`{ featureName, id, tableList? }`)
// carried by fetchWithFksPending/fetchWithIFKsPending onto the `{ p_id, p_table_name }`
// shape the fetch_with_fk / fetch_with_ifk RPCs actually take (mirrors the mapping
// already established in apiThunks.ts).
const mapToFkArgs = (args: FetchOneThunkArgs) => ({
  p_id: args.id,
  p_table_name: args.featureName,
});

// fetch_all_fk_ifk takes `p_primary_key_values` (Json) instead of `p_id`.
const mapToFkIfkArgs = (args: FetchOneThunkArgs) => ({
  p_primary_key_values: args.id,
  p_table_name: args.featureName,
});

// fetch_custom_rels additionally requires p_table_list (non-optional on the RPC).
const mapToCustomRelsArgs = (args: FetchOneThunkArgs) => ({
  p_id: args.id,
  p_table_name: args.featureName,
  p_table_list: args.tableList ?? [],
});

// Generic saga handler. `apiCall` is one of fetchWithFk/fetchWithIfk/fetchWithFkIfk/
// fetchCustomRels (each `(args: Args) => Promise<unknown>` for that RPC's own arg
// shape); `mapArgs` converts the thunk's `FetchOneThunkArgs` payload into `Args`;
// `fulfilledAction`/`rejectedAction` are the corresponding createAction creators
// from createFeatureActions.
// The fulfilled creators from createFeatureActions carry PaginatedResponse
// payloads; the RPC result arrives as `unknown`, so narrow it honestly before
// dispatching instead of widening the creators' parameter.
function isPaginatedResponse(v: unknown): v is PaginatedResponse<unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    "paginatedData" in v &&
    Array.isArray(v.paginatedData)
  );
}

function* fetchWithSaga<Args>(
  action: { payload: FetchOneThunkArgs },
  apiCall: (args: Args) => Promise<unknown>,
  mapArgs: (args: FetchOneThunkArgs) => Args,
  fulfilledAction: (payload: PaginatedResponse<unknown>) => {
    type: string;
    payload: PaginatedResponse<unknown>;
  },
  rejectedAction: (payload: string) => { type: string; payload: string },
) {
  try {
    const response: unknown = yield call(apiCall, mapArgs(action.payload));

    if (isPaginatedResponse(response)) {
      yield put(fulfilledAction(response));
    } else {
      throw new Error("Failed to fetch data");
    }
  } catch (error) {
    yield put(rejectedAction(extractErrorMessage(error)));
  }
}

// Dynamic saga generator function
export function createFeatureSagas(
  featureName: FeatureName,
  featureSchema: z.ZodTypeAny,
) {
  const {
    fetchWithFksPending,
    fetchWithFksFulfilled,
    fetchWithFksRejected,
    fetchWithIFKsPending,
    fetchWithIFKsFulfilled,
    fetchWithIFKsRejected,
    fetchWithFkIfkPending,
    fetchWithFkIfkFulfilled,
    fetchWithFkIfkRejected,
    fetchCustomRelsPending,
    fetchCustomRelsFulfilled,
    fetchCustomRelsRejected,
  } = createFeatureActions(featureName, featureSchema);

  function* featureSagas() {
    yield all([
      takeEvery(
        fetchWithFksPending.type,
        function* (action: ReturnType<typeof fetchWithFksPending>) {
          yield fetchWithSaga(
            action,
            fetchWithFk,
            mapToFkArgs,
            fetchWithFksFulfilled,
            fetchWithFksRejected,
          );
        },
      ),
      takeEvery(
        fetchWithIFKsPending.type,
        function* (action: ReturnType<typeof fetchWithIFKsPending>) {
          yield fetchWithSaga(
            action,
            fetchWithIfk,
            mapToFkArgs,
            fetchWithIFKsFulfilled,
            fetchWithIFKsRejected,
          );
        },
      ),
      takeEvery(
        fetchWithFkIfkPending.type,
        function* (action: ReturnType<typeof fetchWithFkIfkPending>) {
          yield fetchWithSaga(
            action,
            fetchWithFkIfk,
            mapToFkIfkArgs,
            fetchWithFkIfkFulfilled,
            fetchWithFkIfkRejected,
          );
        },
      ),
      takeEvery(
        fetchCustomRelsPending.type,
        function* (action: ReturnType<typeof fetchCustomRelsPending>) {
          yield fetchWithSaga(
            action,
            fetchCustomRels,
            mapToCustomRelsArgs,
            fetchCustomRelsFulfilled,
            fetchCustomRelsRejected,
          );
        },
      ),
    ]);
  }

  return featureSagas;
}

export function createSchemaSagas(
  featureName: FeatureName,
  featureSchema: z.ZodTypeAny,
) {
  const {
    fetchWithFksPending,
    fetchWithFksFulfilled,
    fetchWithFksRejected,
    fetchWithIFKsPending,
    fetchWithIFKsFulfilled,
    fetchWithIFKsRejected,
    fetchWithFkIfkPending,
    fetchWithFkIfkFulfilled,
    fetchWithFkIfkRejected,
    fetchCustomRelsPending,
    fetchCustomRelsFulfilled,
    fetchCustomRelsRejected,
  } = createFeatureActions(featureName, featureSchema);

  function* featureSagas() {
    yield all([
      takeEvery(
        fetchWithFksPending.type,
        function* (action: ReturnType<typeof fetchWithFksPending>) {
          yield fetchWithSaga(
            action,
            fetchWithFk,
            mapToFkArgs,
            fetchWithFksFulfilled,
            fetchWithFksRejected,
          );
        },
      ),
      takeEvery(
        fetchWithIFKsPending.type,
        function* (action: ReturnType<typeof fetchWithIFKsPending>) {
          yield fetchWithSaga(
            action,
            fetchWithIfk,
            mapToFkArgs,
            fetchWithIFKsFulfilled,
            fetchWithIFKsRejected,
          );
        },
      ),
      takeEvery(
        fetchWithFkIfkPending.type,
        function* (action: ReturnType<typeof fetchWithFkIfkPending>) {
          yield fetchWithSaga(
            action,
            fetchWithFkIfk,
            mapToFkIfkArgs,
            fetchWithFkIfkFulfilled,
            fetchWithFkIfkRejected,
          );
        },
      ),
      takeEvery(
        fetchCustomRelsPending.type,
        function* (action: ReturnType<typeof fetchCustomRelsPending>) {
          yield fetchWithSaga(
            action,
            fetchCustomRels,
            mapToCustomRelsArgs,
            fetchCustomRelsFulfilled,
            fetchCustomRelsRejected,
          );
        },
      ),
    ]);
  }

  return featureSagas;
}
