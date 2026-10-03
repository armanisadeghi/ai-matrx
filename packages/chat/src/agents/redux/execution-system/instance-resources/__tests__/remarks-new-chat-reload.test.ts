/**
 * "New chat about this" — the passage chip a fresh /chat/new room was opened
 * with survives a reload, although the room re-mints its conversation id on
 * every mount: staged remarks are mirrored to the surface alias (the same key
 * the typed draft uses while the conversation has no turns).
 *
 * Forcing functions over the real slice, middleware and storage module:
 *   1. a chip staged BEFORE the alias registered, then a reload with a new id
 *      → the chip comes back under the new id;
 *   2. once sent, the alias holds a tombstone → a reload restores nothing;
 *   3. a shared alias (two live composers) never restores.
 *
 * Use case: Lena selects "Retention is the real problem" in an answer and picks
 * New chat about this, then her laptop reloads the tab.
 */

import { configureStore } from "@reduxjs/toolkit";
import { DEFAULT_CHAT_PREFERENCES } from "../../../../../host/defaults/prefs";
import instanceResourcesReducer, { markResourcesSubmitted } from "../instance-resources.slice";
import instanceUserInputReducer, {
  initInstanceUserInput,
  markInputSubmitted,
} from "../../instance-user-input/instance-user-input.slice";
import { composerDraftMiddleware } from "../../instance-user-input/composer-draft.middleware";
import {
  __resetComposerDraftGenerationsForTest,
  registerComposerDraftAlias,
} from "../../instance-user-input/composer-draft-store";
import { restoreComposerRemarks } from "../../instance-user-input/restore-composer-remarks.thunk";
import { REMARKS_BLOCK_TYPE, remarkSourceOf, stageRemark, type RemarkItem } from "../remarks";

const ALIAS = "chat:7d1e2f3a-4b5c-4d6e-8f70-819a2b3c4d5e";
const passage: RemarkItem = {
  kind: "comment",
  target: { conversationId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", messageId: "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9" },
  commentId: null,
  quote: "Retention is the real problem",
  body: "",
};

function makeStore() {
  return configureStore({
    reducer: {
      instanceResources: instanceResourcesReducer,
      instanceUserInput: instanceUserInputReducer,
      chatHost: (state = { preferences: { ...DEFAULT_CHAT_PREFERENCES, restoreUnsentDrafts: true } }) => state,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware: (getDefault) => getDefault().concat(composerDraftMiddleware as any),
  });
}
// The thunks are typed for the full chat store; this store carries only the slices they touch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

/** A fresh /chat/new mount: new store, new in-memory state, a NEW conversation id. */
function mount(cid: string): S {
  __resetComposerDraftGenerationsForTest();
  const s = makeStore();
  s.dispatch(initInstanceUserInput({ conversationId: cid }));
  return s;
}

function quotes(s: S, cid: string): (string | null)[] {
  return Object.values(s.getState().instanceResources.byConversationId[cid] ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => r.blockType === REMARKS_BLOCK_TYPE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => {
      const remark = remarkSourceOf(r)?.remark;
      return remark?.kind === "comment" ? remark.quote : null;
    });
}

beforeEach(() => {
  window.localStorage.clear();
  __resetComposerDraftGenerationsForTest();
});

test("the passage chip comes back after a reload re-mints the conversation id", () => {
  const first = "c-first-mount";
  let s = mount(first);
  s.dispatch(stageRemark(first, passage, { coalesceKey: "passage:1" }));
  registerComposerDraftAlias(first, ALIAS);

  const second = "c-after-reload";
  s = mount(second);
  registerComposerDraftAlias(second, ALIAS);
  expect(s.dispatch(restoreComposerRemarks(second, null, ALIAS))).toBe(1);
  expect(quotes(s, second)).toEqual(["Retention is the real problem"]);
});

test("once sent, a reload restores nothing", () => {
  const first = "c-first-mount";
  let s = mount(first);
  registerComposerDraftAlias(first, ALIAS);
  s.dispatch(stageRemark(first, passage, { coalesceKey: "passage:1" }));
  s.dispatch(markInputSubmitted({ conversationId: first, userValues: {} }));
  s.dispatch(markResourcesSubmitted(first));

  const second = "c-after-reload";
  s = mount(second);
  registerComposerDraftAlias(second, ALIAS);
  expect(s.dispatch(restoreComposerRemarks(second, null, ALIAS))).toBe(0);
});

test("a shared alias never restores", () => {
  const first = "c-first-mount";
  const s = mount(first);
  registerComposerDraftAlias(first, ALIAS);
  s.dispatch(stageRemark(first, passage, { coalesceKey: "passage:1" }));
  registerComposerDraftAlias("c-other-column", ALIAS);
  expect(s.dispatch(restoreComposerRemarks("c-third", null, ALIAS))).toBe(0);
});
