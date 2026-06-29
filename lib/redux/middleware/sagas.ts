import { call, put, takeEvery, all } from "redux-saga/effects";
import { extractErrorMessage } from "@/utils/errors";
import type {
  FetchOneThunkArgs,
  PaginatedResponse,
  FeatureName,
} from "@/types/reduxTypes";
import {
  fetchWithFk,
  fetchWithIfk,
  fetchWithFkIfk,
  fetchCustomRels,
} from "@/lib/redux/api";
import { createFeatureActions } from "@/lib/redux/actions/featureActions";
import * as z from "zod";

// Generic saga handler
function* fetchWithSaga(
  action: ReturnType<any>,
  apiCall: any,
  fulfilledAction: any,
  rejectedAction: any,
) {
  try {
    const response: PaginatedResponse<any> = yield call(
      apiCall,
      action.payload,
    );

    if (response) {
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
            fetchCustomRelsFulfilled,
            fetchCustomRelsRejected,
          );
        },
      ),
    ]);
  }

  return featureSagas;
}
