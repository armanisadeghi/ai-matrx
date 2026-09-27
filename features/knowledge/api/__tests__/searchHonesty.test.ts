/**
 * From the live walk (hub-live-walk 08–09): under load, `type:chat` then two
 * Backspaces dropped the bar to the title stand-in with "not on the server"
 * although the service was deployed. The rules this pins:
 *   - only a 404/405 falls back to the stand-in (and says "not on the server");
 *   - a SLOW stream is still searching — no fallback, sections just arrive late;
 *   - a request ABORTED by a newer keystroke is ignored — no fallback, no memo;
 *   - "did not answer" only after `done` without that section; a stream that
 *     stops before `done` says it stopped.
 */
const postNdjson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postNdjson: (...a: unknown[]) => postNdjson(...a) }));
const searchCandidatesAcrossTokens = jest.fn();
jest.mock("@/features/scopes/service/associationCandidates", () => ({
  searchCandidatesAcrossTokens: (...a: unknown[]) => searchCandidatesAcrossTokens(...a),
}));

import { BackendApiError } from "@/lib/api/errors";
import {
  resetKnowledgeSearchEngine,
  searchKnowledge,
  type KnowledgeSearchEngine,
} from "@/features/knowledge/api/knowledgeSearch";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notes = { event: "data", data: { type: "section", key: "notes", items: [{ id: "n", entity: "note", title: "N" }], count: 1 } };
const chats = { event: "data", data: { type: "section", key: "chats", items: [], count: 0 } };

beforeEach(() => {
  postNdjson.mockReset();
  searchCandidatesAcrossTokens.mockReset();
  searchCandidatesAcrossTokens.mockResolvedValue({ results: [], failures: [] });
  resetKnowledgeSearchEngine();
});

it("a slow stream (search_started late) is still the service — sections arrive, no fallback", async () => {
  postNdjson.mockReturnValue(
    (async function* () {
      await sleep(300);
      yield { event: "data", data: { type: "search_started" } };
      await sleep(200);
      yield notes;
      yield chats;
      yield { event: "end", data: {} };
    })(),
  );
  const engines: KnowledgeSearchEngine[] = [];
  const sections = await searchKnowledge({ text: "x" }, { onEngine: (e) => engines.push(e) });
  expect(searchCandidatesAcrossTokens).not.toHaveBeenCalled();
  expect(engines).toEqual(["server"]);
  expect(sections.find((s) => s.key === "notes")?.items[0].title).toBe("N");
  // `done` came without Sources: that one — and only after done — did not answer.
  expect(sections.find((s) => s.key === "sources")?.error?.message).toBe("This section did not answer.");
  expect(sections.find((s) => s.key === "top_hit")).toBeUndefined();
});

it("a request aborted by a newer keystroke is ignored — no fallback, and the next search still hits the service", async () => {
  const ctrl = new AbortController();
  postNdjson.mockReturnValueOnce(
    (async function* () {
      await sleep(100);
      // The body ends quietly after the abort (what a browser may do).
    })(),
  );
  const run = searchKnowledge({ text: "x" }, { signal: ctrl.signal });
  ctrl.abort();
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(searchCandidatesAcrossTokens).not.toHaveBeenCalled();

  postNdjson.mockReturnValueOnce(
    (async function* () {
      yield { event: "data", data: { type: "search_started" } };
      yield notes;
      yield { event: "end", data: {} };
    })(),
  );
  const engines: KnowledgeSearchEngine[] = [];
  await searchKnowledge({ text: "xy" }, { onEngine: (e) => engines.push(e) });
  expect(engines).toEqual(["server"]);
});

it("a 404 — and only a 404/405 — falls back to the title stand-in", async () => {
  postNdjson.mockReturnValue(
    (async function* () {
      throw new BackendApiError({ code: "not_found" as never, detail: "Not Found", userMessage: "Not found.", status: 404 });
    })(),
  );
  const engines: KnowledgeSearchEngine[] = [];
  await searchKnowledge({ text: "x" }, { onEngine: (e) => engines.push(e) });
  expect(engines).toEqual(["title_stand_in"]);
  expect(searchCandidatesAcrossTokens).toHaveBeenCalled();
});

it("a stream that stops before done says it stopped, not 'did not answer' and not a fallback", async () => {
  postNdjson.mockReturnValue(
    (async function* () {
      yield { event: "data", data: { type: "search_started" } };
      yield notes;
    })(),
  );
  const sections = await searchKnowledge({ text: "x" });
  expect(searchCandidatesAcrossTokens).not.toHaveBeenCalled();
  expect(sections.find((s) => s.key === "chats")?.error?.message).toBe(
    "The search stopped before this section answered.",
  );
});
