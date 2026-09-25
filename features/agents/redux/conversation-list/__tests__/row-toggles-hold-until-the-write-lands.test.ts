/**
 * GATES-TAIL-2 census (the sixth class member). A conversation's Pin, Archive and
 * Exclude-from-knowledge-graph toggles patched the list BEFORE the write answered and, on a
 * refusal, handed the database's own line to the toast. An archive RLS filtered to zero rows
 * read as success. Rule: pending, never optimistic; a refusal is said in words.
 */
const setFavorite = jest.fn();
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: { setFavorite: (...a: unknown[]) => setFavorite(...a) },
}));
const chain = { update: jest.fn(), eq: jest.fn(), select: jest.fn() };
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => chain }) } }));
jest.mock("../../execution-system/message-crud/server/fork-conversation-server.thunk", () => ({ forkConversationServer: jest.fn() }));

import {
  setConversationArchived,
  setConversationExcludeFromKg,
  setConversationFavorite,
} from "../conversation-row-actions.thunks";

const ID = "44444444-4444-4444-8444-444444444444";
const state = () =>
  ({ conversationList: { byConversationId: { [ID]: { isFavorite: false, status: "active", excludeFromKg: false } } } }) as never;
const patched = (dispatch: jest.Mock, key: string, value: unknown) =>
  dispatch.mock.calls.some(([a]) => a?.type?.includes("atch") && a.payload?.patch?.[key] === value);
const RAW = /permission denied for|violates|row-level|chat\.conversation|ues_/;

beforeEach(() => {
  jest.resetAllMocks();
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
});

it("pin: nothing moves while the write is in flight; it moves once it lands", async () => {
  let answer!: (v: unknown) => void;
  setFavorite.mockImplementation(() => new Promise((r) => { answer = r; }));
  const dispatch = jest.fn((a) => a);
  const p = setConversationFavorite({ conversationId: ID, isFavorite: true })(dispatch, state, undefined);
  await new Promise((r) => setTimeout(r, 10));
  expect(patched(dispatch, "isFavorite", true)).toBe(false);
  answer({ ok: true, data: null });
  await p;
  expect(patched(dispatch, "isFavorite", true)).toBe(true);
});

it("pin: a refusal never moved it and is said in words", async () => {
  setFavorite.mockResolvedValue({ ok: false, error: { code: "42501", message: "permission denied for function ues_set_favorite" } });
  const dispatch = jest.fn((a) => a);
  const res = await setConversationFavorite({ conversationId: ID, isFavorite: true })(dispatch, state, undefined);
  expect(patched(dispatch, "isFavorite", true)).toBe(false);
  expect((res.payload as { message: string }).message).toMatch(/^Could not pin this conversation\./);
  expect((res.payload as { message: string }).message).not.toMatch(RAW);
});

it("archive: an update RLS filtered to zero rows is a refusal, and nothing moved", async () => {
  chain.select.mockResolvedValue({ data: [], error: null });
  const dispatch = jest.fn((a) => a);
  const res = await setConversationArchived({ conversationId: ID, archived: true })(dispatch, state, undefined);
  expect(patched(dispatch, "status", "archived")).toBe(false);
  expect(res.type).toMatch(/rejected$/);
  expect((res.payload as { message: string }).message).toMatch(/Nothing was saved/);
});

it("exclude from knowledge graph: moves only once it lands; refusals worded", async () => {
  chain.select.mockResolvedValueOnce({ data: [{ id: ID }], error: null });
  const ok = jest.fn((a) => a);
  await setConversationExcludeFromKg({ conversationId: ID, excludeFromKg: true })(ok, state, undefined);
  expect(patched(ok, "excludeFromKg", true)).toBe(true);

  chain.select.mockResolvedValueOnce({ data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "conversation"' } });
  const bad = jest.fn((a) => a);
  const res = await setConversationExcludeFromKg({ conversationId: ID, excludeFromKg: true })(bad, state, undefined);
  expect(patched(bad, "excludeFromKg", true)).toBe(false);
  expect((res.payload as { message: string }).message).not.toMatch(RAW);
});
