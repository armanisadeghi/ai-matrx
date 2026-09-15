/** @jest-environment jsdom */
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act } from "react";
import { createRoot } from "react-dom/client";
import reducer, { hydrateActor } from "@/lib/redux/slices/sandboxLifecycleSlice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let authReady = true;
let actorId: string | null = "11111111-1111-4111-8111-111111111111";
let settled = true;
let mockStore: ReturnType<typeof configureStore>;
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockStore.dispatch,
  useAppSelector: (selector: { name: string }) => selector.name === "selectAuthReady" ? authReady : actorId,
}));
jest.mock("@/lib/sync/useSyncHydrated", () => ({ useSyncHydrated: () => settled }));
jest.mock("@/lib/durable-run/sandbox-operation-receipt", () => ({ readSandboxOperationReceipts: jest.fn(() => []) }));
const { SandboxLifecycleObserver }: typeof import("./SandboxLifecycleObserver") = require("./SandboxLifecycleObserver");
const store = mockStore = configureStore({ reducer: { sandboxLifecycle: reducer } });

test("mounted observer clears an old actor immediately when sync becomes unsettled", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Provider store={store}><SandboxLifecycleObserver /></Provider>); });
  expect(store.getState().sandboxLifecycle.actorId).toBe(actorId);
  settled = false;
  await act(async () => { root.render(<Provider store={store}><SandboxLifecycleObserver /></Provider>); });
  expect(store.getState().sandboxLifecycle.actorId).toBeNull();
  await act(async () => root.unmount()); container.remove();
  settled = true; authReady = true; actorId = "11111111-1111-4111-8111-111111111111";
});
