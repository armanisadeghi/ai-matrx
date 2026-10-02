/**
 * verify-4 V4-F #3: a Source removed in "Review what goes in" stayed on the
 * page — the answer only rewrote the pointers it named. The rule lives in the
 * runtime (`@ai-matrx/agents` removedInReview); this drives the REAL controller
 * through the REAL Redux binding; only the transport is faked.
 */
const postJson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { configureStore } from "@reduxjs/toolkit";
import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { createSourceSetController } from "@ai-matrx/agents/sources/runtime";
import instanceResources from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.slice";
import wizardDraft from "@/lib/redux/slices/wizardDraftSlice";
import type { AppStore } from "@/lib/redux/store";
import { reduxSourceSetAdapter, sourceSurfaceKey } from "../useSourceSet";

const KEY = sourceSurfaceKey("flashcards:review-remove");
const PDF = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";
const PAGE = "33333333-3333-4333-8333-333333333333";

it("Remove in the review takes exactly that Source off the page", () => {
  const store = configureStore({ reducer: { instanceResources, wizardDraft } }) as unknown as AppStore;
  const set = createSourceSetController(reduxSourceSetAdapter(store, KEY));
  const pdf = set.addReady({ kind: "files", label: "ngss-ms-science-guide-v4.pdf", ref: createSourceRef("file", PDF) });
  const note = set.addReady({ kind: "notes", label: "Photosynthesis and cell energy", ref: createSourceRef("note", NOTE) });
  const page = set.addReady({ kind: "web", label: "Enzyme - Wikipedia", ref: createSourceRef("processed_document", PAGE) });

  const reviewed = set.toSourceSet();
  // The person removes the upload and narrows the web page to one part.
  const answer = createSourceSet([
    createSourceRef("note", NOTE),
    createSourceRef("processed_document", PAGE, { include_segments: ["s2"] }),
  ]);
  set.applySourceSet(answer, { reviewed });

  expect(set.getState().cards.map((c) => c.id)).toEqual([note, page]);
  expect(set.getState().cards.find((c) => c.id === pdf)).toBeUndefined();
  expect(set.toSourceSet().sources.find((r) => r.resource_id === PAGE)?.include_segments).toEqual(["s2"]);
  expect(Object.keys(store.getState().instanceResources.byConversationId[KEY]!).sort()).toEqual([note, page].sort());
});
