/**
 * USI-7: the Source input's rules live in `@ai-matrx/agents/sources/runtime`;
 * the web app binds its state to Redux (`instanceResources` for the cards,
 * `wizardDraft` for what a reload reads back). The binding is the ONE new piece
 * of logic on this side, so this drives the real runtime controller through the
 * real Redux adapter and reads the slices back: add → settle → measured →
 * reviewed → removed, the order kept, the draft written — then a fresh page
 * (new store, same saved draft) brings the picks back.
 *
 * Only the transport is faked (`postJson`); every reducer is real.
 */
const postJson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { configureStore } from "@reduxjs/toolkit";
import { createSourceRef, createSourceSet, type SourceManifest } from "@ai-matrx/agents/sources";
import { createSourceSetController, RELOADED_RESUMING } from "@ai-matrx/agents/sources/runtime";
import instanceResources from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import wizardDraft from "@/lib/redux/slices/wizardDraftSlice";
import type { AppStore } from "@/lib/redux/store";
import { reduxSourceSetAdapter, sourceSurfaceKey } from "./useSourceSet";

const KEY = sourceSurfaceKey("flashcards:new");
const DOC = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";

function makeTestStore(preloaded?: unknown) {
  return configureStore({
    reducer: { instanceResources, wizardDraft },
    ...(preloaded ? { preloadedState: preloaded as never } : {}),
  }) as unknown as AppStore;
}

const manifest = (id: string): SourceManifest => ({
  __kind: "source_manifest",
  sources: [
    {
      ref: createSourceRef("processed_document", id),
      label: "x",
      resource_type: "processed_document",
      state: "ready",
      forms: [{ form: "clean", label: "Clean text", chars: 1234, available: true }],
      default_form: "clean",
    },
  ],
  total_chars: 1234,
  estimated_tokens: 0,
  model_context_tokens: null,
});

beforeEach(() => postJson.mockReset());

it("drives the real runtime through Redux and reads it back", async () => {
  const store = makeTestStore();
  const set = createSourceSetController(reduxSourceSetAdapter(store, KEY));

  const pending = set.addPending({ kind: "paste", label: "Pasted text", input: { text: "Mitochondria make ATP." } });
  const note = set.addReady({ kind: "notes", label: "Lab note", ref: createSourceRef("note", NOTE) });
  set.settle(pending, { ref: createSourceRef("processed_document", DOC), label: "Cell notes" });

  const resources = store.getState().instanceResources.byConversationId[KEY]!;
  const ordered = Object.values(resources).sort((a, b) => a.sortOrder - b.sortOrder);
  expect(ordered.map((r) => [r.resourceId, r.blockType, r.status])).toEqual([
    [pending, "source_ref", "ready"],
    [note, "source_ref", "ready"],
  ]);
  expect((resources[pending]!.source as { input?: unknown; label: string }).label).toBe("Cell notes");
  expect((resources[pending]!.source as { input?: unknown }).input).toBeUndefined();

  // The measurement reaches the card (Redux `preview`) and the total.
  postJson.mockResolvedValueOnce({ data: manifest(DOC) });
  await set.manifest();
  expect(store.getState().instanceResources.byConversationId[KEY]![pending]!.preview).toMatchObject({
    default_form: "clean",
  });
  expect(set.totalChars()).toBe(1234);

  // The topic and the review's answer land; the draft holds both cards and the topic.
  set.setTopic("Cell energy");
  set.applySourceSet(createSourceSet([createSourceRef("processed_document", DOC, { max_chars: 500 })]));
  const saved = store.getState().wizardDraft.drafts[KEY]!.data as { sources: Array<{ id: string }>; topic: string };
  expect(saved.sources.map((c) => c.id)).toEqual([pending, note]);
  expect(saved.topic).toBe("Cell energy");
  expect(set.toSourceSet().sources[0]!.max_chars).toBe(500);
  expect(set.getState().topic).toBe("Cell energy");

  // getState is stable until something changes (useSyncExternalStore relies on it).
  expect(set.getState()).toBe(set.getState());

  set.remove(note);
  expect(Object.keys(store.getState().instanceResources.byConversationId[KEY]!)).toEqual([pending]);

  // A fresh page: a new store holding only the saved draft brings the pick back.
  const second = makeTestStore({ wizardDraft: store.getState().wizardDraft });
  const again = createSourceSetController(reduxSourceSetAdapter(second, KEY));
  expect(again.restore(second.getState().wizardDraft.drafts[KEY]!.data)).toBe(true);
  expect(again.getState().cards.map((c) => [c.id, c.status])).toEqual([[pending, "ready"]]);
  expect(again.getState().topic).toBe("Cell energy");
});

it("a card cut off mid-landing comes back as the resume state, not a spinner", () => {
  const store = makeTestStore();
  const set = createSourceSetController(reduxSourceSetAdapter(store, KEY));
  set.addPending({ kind: "paste", label: "Pasted text", input: { text: "keep me" } });
  const next = makeTestStore({ wizardDraft: store.getState().wizardDraft });
  const again = createSourceSetController(reduxSourceSetAdapter(next, KEY));
  again.restore(next.getState().wizardDraft.drafts[KEY]!.data);
  const [card] = Object.values(next.getState().instanceResources.byConversationId[KEY]!);
  expect([card!.status, card!.errorMessage]).toEqual(["error", RELOADED_RESUMING]);
});
