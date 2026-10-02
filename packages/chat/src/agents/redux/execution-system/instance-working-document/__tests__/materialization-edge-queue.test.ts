import { configureStore } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import {
  confirmServerSync,
  createInstance,
} from "../../conversations/conversations.slice";
import * as conversationPersistence from "../../conversations/conversation-persistence";
import {
  setWorkingDocBinding,
  setWorkingDocContent,
  setWorkingDocEnabled,
} from "../instance-working-document.slice";
import * as workingDocumentService from "../cx-working-document.service";
import {
  flushPendingDocumentEdgesThunk,
  materializeWorkingDocumentThunk,
  reflectAgentMaterializedThunk,
} from "../instance-working-document.thunks";

const USER_ID = "4cf62e4e-2679-484f-b652-034e697418df";
const AGENT_ID = "506a20fc-34a9-4038-b38b-6c71ab09b173";
const ORG_ID = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
}

function seedAnnouncedConversation(
  store: ReturnType<typeof makeStore>,
  conversationId: string,
): void {
  store.dispatch(setUserAuth({ id: USER_ID }));
  store.dispatch(
    createInstance({
      conversationId,
      agentId: AGENT_ID,
      agentType: "user",
      origin: "manual",
      sourceFeature: "chat",
      organizationId: ORG_ID,
    }),
  );
  // Mirrors the stream order: record_reserved announces the id and flips this
  // flag before the backend's atomic turn transaction commits the row.
  store.dispatch(confirmServerSync(conversationId));
}

function deferredPersistenceProof(): {
  promise: Promise<boolean>;
  resolve: (persisted: boolean) => void;
} {
  let resolve = (_persisted: boolean): void => {
    throw new Error("Persistence proof was resolved before initialization");
  };
  const promise = new Promise<boolean>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("working-document materialization edge ordering", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("materializes the user's row but defers assoc_add until the conversation is readable", async () => {
    const conversationId = "cef7a4c2-8f84-41d3-bf96-66e65833ad4a";
    const documentId = "f5a501ff-4b2d-50b1-9f4b-eba4947fc8cf";
    const store = makeStore();
    seedAnnouncedConversation(store, conversationId);
    store.dispatch(
      setWorkingDocEnabled({ conversationId, kind: "working", enabled: true }),
    );
    store.dispatch(
      setWorkingDocBinding({
        conversationId,
        kind: "working",
        binding: {
          kind: "cx_working_document",
          id: documentId,
          label: null,
        },
      }),
    );
    store.dispatch(
      setWorkingDocContent({
        conversationId,
        kind: "working",
        content: "First durable content",
      }),
    );

    const persistence = deferredPersistenceProof();
    jest
      .spyOn(conversationPersistence, "waitForConversationPersisted")
      .mockReturnValue(persistence.promise);
    jest
      .spyOn(workingDocumentService, "materializeWorkingDocument")
      .mockResolvedValue({
        id: documentId,
        conversationId,
        kind: "working",
        title: "First durable content",
        content: "First durable content",
        version: 0,
        createdAt: "2026-08-24T19:58:35.240Z",
        updatedAt: "2026-08-24T19:58:35.240Z",
      });
    const link = jest
      .spyOn(workingDocumentService, "linkDocumentToConversation")
      .mockResolvedValue();

    const flush = store.dispatch(
      flushPendingDocumentEdgesThunk({ conversationId }),
    );
    await store.dispatch(materializeWorkingDocumentThunk({ conversationId }));

    expect(
      workingDocumentService.materializeWorkingDocument,
    ).toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(
      store.getState().instanceWorkingDocument.byKey[conversationId]
        ?.materialized,
    ).toBe(true);

    persistence.resolve(true);
    await flush;

    expect(link).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith({
      conversationId,
      documentId,
      organizationId: ORG_ID,
      kind: "working",
      enabled: true,
    });
  });

  it("routes agent-first materialization through the same persistence queue", async () => {
    const conversationId = "83c74a82-f357-4a9d-b528-32aece82dca3";
    const documentId = "b598259a-6558-5d87-b5c5-61ffb129787e";
    const store = makeStore();
    seedAnnouncedConversation(store, conversationId);

    const persistence = deferredPersistenceProof();
    jest
      .spyOn(conversationPersistence, "waitForConversationPersisted")
      .mockReturnValue(persistence.promise);
    jest
      .spyOn(workingDocumentService, "getCxWorkingDocumentById")
      .mockResolvedValue({
        id: documentId,
        conversationId,
        kind: "working",
        title: "Agent materialized",
        content: "Agent-authored content",
        version: 0,
        createdAt: "2026-08-24T19:58:35.240Z",
        updatedAt: "2026-08-24T19:58:35.240Z",
      });
    const link = jest
      .spyOn(workingDocumentService, "linkDocumentToConversation")
      .mockResolvedValue();

    const flush = store.dispatch(
      flushPendingDocumentEdgesThunk({ conversationId }),
    );
    await store.dispatch(
      reflectAgentMaterializedThunk({ conversationId, documentId }),
    );

    expect(link).not.toHaveBeenCalled();

    persistence.resolve(true);
    await flush;

    expect(link).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith({
      conversationId,
      documentId,
      organizationId: ORG_ID,
      kind: "working",
      enabled: true,
    });
  });
});
