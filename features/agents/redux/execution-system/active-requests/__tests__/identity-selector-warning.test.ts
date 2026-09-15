import { configureStore } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  selectAllTypedDataPayloads,
  selectPhaseHistory,
  selectProviderRetryHistory,
} from "../active-requests.selectors";
import activeRequestsReducer, { createRequest } from "../active-requests.slice";

const REQUEST_ID = "request-selector-warning";

function makeState(): RootState {
  const store = configureStore({
    reducer: { activeRequests: activeRequestsReducer },
  });
  store.dispatch(
    createRequest({
      requestId: REQUEST_ID,
      conversationId: "conversation-selector-warning",
    }),
  );
  return store.getState() as unknown as RootState;
}

test("raw execution arrays retain their state references without Reselect identity warnings", () => {
  const first = makeState();
  const second = makeState();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  const selectors = [
    selectProviderRetryHistory(REQUEST_ID),
    selectPhaseHistory(REQUEST_ID),
    selectAllTypedDataPayloads(REQUEST_ID),
  ];

  for (const selector of selectors) {
    const firstResult = selector(first);
    const secondResult = selector(second);
    expect(firstResult).toBeDefined();
    expect(secondResult).toBeDefined();
    expect(firstResult).not.toBe(secondResult);
  }

  const identityWarnings = warn.mock.calls.filter(([message]) =>
    String(message).includes(
      "The result function returned its own inputs without modification",
    ),
  );
  warn.mockRestore();
  expect(identityWarnings).toHaveLength(0);
});
