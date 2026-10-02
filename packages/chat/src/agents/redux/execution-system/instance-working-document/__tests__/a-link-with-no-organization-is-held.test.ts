/**
 * A LINK THE PERSON ASKED FOR, WITH NO ORGANIZATION CHOSEN, IS HELD — NEVER DROPPED.
 *
 * `/chat/new?attachDoc=<id>` links a working document to the new chat. The
 * link is an org-scoped write (`platform.associations`). In a session with no
 * organization selected the thunk used to skip the write and say "saving the
 * link failed" — the person was never asked. The law (Arman, 2026-09-19): the
 * request is HELD, the person is shown their memberships, SETS one, and the
 * write proceeds; "not now" is an answer, not a failure.
 *
 * Proven failing before passing (2026-10-02): against the previous
 * `resolveOrgId`-only path → "asks, then writes" RED (require never called,
 * the link never written); restored → GREEN.
 */

import { configureStore } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@host/lib/redux/rootReducer";
import { setUserAuth } from "@host/lib/redux/slices/userAuthSlice";
import { confirmServerSync, createInstance } from "../../conversations/conversations.slice";
import * as workingDocumentService from "../cx-working-document.service";
import { selectWorkingDocEnabled, selectWorkingDocError } from "../instance-working-document.selectors";
import {
  linkConversationDocumentThunk,
  openWorkspaceDocumentThunk,
} from "../instance-working-document.thunks";
import { _resetChatHostForTests, configureChat } from "../../../../../host/configure";
import type { ChatHost } from "../../../../../host/contract";
import { createFakeDb } from "../../../../../host/__tests__/fake-db";

const USER_ID = "4cf62e4e-2679-484f-b652-034e697418df";
const AGENT_ID = "506a20fc-34a9-4038-b38b-6c71ab09b173";
const CHOSEN_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";
const DOCUMENT_ID = "f5a501ff-4b2d-40b1-9f4b-eba4947fc8cf";
const ORIGIN_CONVERSATION = "0b7a1c55-2a4e-4f0d-8f7e-1d9c3b5a7e21";

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
}

/** A conversation born this session with no organization (none was selected). */
function seedOrglessConversation(store: ReturnType<typeof makeStore>, conversationId: string) {
  store.dispatch(setUserAuth({ id: USER_ID }));
  store.dispatch(
    createInstance({
      conversationId,
      agentId: AGENT_ID,
      agentType: "user",
      origin: "manual",
      sourceFeature: "chat",
      organizationId: null,
    }),
  );
  // Its row exists, so the link is written now rather than queued.
  store.dispatch(confirmServerSync(conversationId));
}

/** The host's hold-and-set gate: records each ask, answers with the person's choice. */
function hostWhoseGateAnswers(answer: () => Promise<string>) {
  const asks: string[] = [];
  const host: ChatHost = {
    db: createFakeDb().db,
    org: {
      active: () => null,
      subscribe: () => () => undefined,
      require: (reason) => {
        asks.push(reason);
        return answer();
      },
    },
  };
  configureChat(host);
  return asks;
}

function cancelled(): Error {
  const error = new Error("");
  error.name = "OrganizationSelectionCancelled";
  return error;
}

function stubDocument() {
  jest.spyOn(workingDocumentService, "getCxWorkingDocumentById").mockResolvedValue({
    id: DOCUMENT_ID,
    conversationId: ORIGIN_CONVERSATION,
    kind: "working",
    title: "Launch plan",
    content: "# Launch plan",
    version: 3,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  });
  jest
    .spyOn(workingDocumentService, "getWorkingDocumentAccess")
    .mockResolvedValue({ level: "admin", isOwner: true, exists: true });
  return jest.spyOn(workingDocumentService, "linkDocumentToConversation").mockResolvedValue();
}

afterEach(() => {
  jest.restoreAllMocks();
  _resetChatHostForTests();
});

describe("linking a document to a chat with no organization selected", () => {
  it("asks the person for an organization, then writes the link in the one they chose", async () => {
    const conversationId = "cef7a4c2-8f84-41d3-bf96-66e65833ad4a";
    const store = makeStore();
    seedOrglessConversation(store, conversationId);
    const asks = hostWhoseGateAnswers(() => Promise.resolve(CHOSEN_ORG));
    const link = stubDocument();

    await store.dispatch(linkConversationDocumentThunk({ conversationId, kind: "working", documentId: DOCUMENT_ID }));

    expect(asks).toEqual(["write"]);
    expect(link).toHaveBeenCalledWith({
      conversationId,
      documentId: DOCUMENT_ID,
      organizationId: CHOSEN_ORG,
      kind: "working",
      enabled: true,
    });
    expect(selectWorkingDocError(conversationId, "working")(store.getState())).toBeNull();
  });

  it("'not now' keeps the link for this session and shows no failure", async () => {
    const conversationId = "83c74a82-f357-4a9d-b528-32aece82dca3";
    const store = makeStore();
    seedOrglessConversation(store, conversationId);
    const asks = hostWhoseGateAnswers(() => Promise.reject(cancelled()));
    const link = stubDocument();

    await store.dispatch(linkConversationDocumentThunk({ conversationId, kind: "working", documentId: DOCUMENT_ID }));

    expect(asks).toEqual(["write"]);
    expect(link).not.toHaveBeenCalled();
    expect(selectWorkingDocEnabled(conversationId, "working")(store.getState())).toBe(true);
    expect(selectWorkingDocError(conversationId, "working")(store.getState())).toBeNull();
  });

  it("attaching a document from the workspace asks the same way", async () => {
    const conversationId = "7d2f0a91-3c4b-4e5f-8a6b-9c0d1e2f3a4b";
    const store = makeStore();
    seedOrglessConversation(store, conversationId);
    const asks = hostWhoseGateAnswers(() => Promise.resolve(CHOSEN_ORG));
    const link = stubDocument();

    await store.dispatch(openWorkspaceDocumentThunk({ documentId: DOCUMENT_ID, attachTo: conversationId }));

    expect(asks).toEqual(["write"]);
    expect(link).toHaveBeenCalledWith(expect.objectContaining({ conversationId, organizationId: CHOSEN_ORG }));
  });
});
