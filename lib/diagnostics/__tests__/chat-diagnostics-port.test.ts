/**
 * The app's diagnostics port files @ai-matrx/chat failures in the Error
 * Inspector (P5): structured entries as they are, the package's own failures
 * under their own "chat" source — never mixed into "runtime-exception".
 */
import { configureStore } from "@reduxjs/toolkit";
import { clearCapturedErrors, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";
import { createAppChatDiagnostics } from "@/lib/diagnostics/chat-diagnostics-port";
import netRequestsReducer from "@/lib/redux/net/netRequestsSlice";

beforeEach(() => clearCapturedErrors());

it("files the package's own failure under the chat source", () => {
  createAppChatDiagnostics().capture(new Error("catalog read refused"), {
    area: "catalog",
    code: "catalog_read_failed",
  });
  expect(getSnapshot()).toMatchObject([
    { source: "chat", name: "chat:catalog", code: "catalog_read_failed", message: "catalog read refused" },
  ]);
});

it("files a structured entry as it is and returns the inspector's id", () => {
  const id = createAppChatDiagnostics().record!({
    source: "unsaved-work",
    message: "A queued message could not be restored to the composer",
    conversationId: "9b1f3c2e-4d5a-4e6f-8a7b-0c1d2e3f4a5b",
  });
  expect(getSnapshot()).toMatchObject([{ id, source: "unsaved-work" }]);
});

it("drives the netRequests slice when given a dispatch", () => {
  const store = configureStore({ reducer: { netRequests: netRequestsReducer } });
  const port = createAppChatDiagnostics(store.dispatch);
  port.requests!.start({ id: "req-7", kind: "agent-run", label: "Manual: agent-3", groupKey: "c1" });
  port.requests!.phase("req-7", "streaming");
  port.requests!.finish({ id: "req-7", phase: "completed" });
  expect(store.getState().netRequests.byId["req-7"]).toMatchObject({ phase: "completed", groupKey: "c1" });
});
