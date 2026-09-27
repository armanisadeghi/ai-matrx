/**
 * When does the hub fall back to the title stand-in? Only when the hub's
 * service did not answer: a 404/405, or a stream that never said
 * `search_started`. A 422 from the live service is a real validation error —
 * its sentence shows in every section, it is never hidden behind the stand-in.
 */
const postNdjson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postNdjson: (...a: unknown[]) => postNdjson(...a) }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({
  searchCandidatesAcrossTokens: jest.fn(),
}));

import { BackendApiError } from "@/lib/api/errors";
import {
  KnowledgeSearchUnavailableError,
  searchKnowledgeServer,
} from "@/features/knowledge/api/knowledgeSearch";

function stream(events: unknown[]) {
  return (async function* () {
    for (const e of events) yield e;
  })();
}
function refuse(status: number, sentence: string) {
  return (async function* () {
    throw new BackendApiError({ code: "validation_error" as never, detail: sentence, userMessage: "Invalid request.", status });
  })();
}

beforeEach(() => postNdjson.mockReset());

it("a 422 shows the server's own sentence in every section, never the stand-in", async () => {
  postNdjson.mockReturnValue(refuse(422, "`date.from` must be before `date.to`."));
  const sections = await searchKnowledgeServer({ text: "x" });
  expect(sections.length).toBeGreaterThan(5);
  for (const s of sections) expect(s.error?.message).toBe("`date.from` must be before `date.to`.");
});

it("a 404 falls back", async () => {
  postNdjson.mockReturnValue(refuse(404, "Not Found"));
  await expect(searchKnowledgeServer({ text: "x" })).rejects.toBeInstanceOf(KnowledgeSearchUnavailableError);
});

it("a 200 that never says search_started (the older route's JSON) falls back", async () => {
  postNdjson.mockReturnValue(stream([]));
  await expect(searchKnowledgeServer({ text: "x" })).rejects.toBeInstanceOf(KnowledgeSearchUnavailableError);
});

it("search_started then sections is the live service", async () => {
  postNdjson.mockReturnValue(
    stream([
      { event: "data", data: { type: "search_started" } },
      { event: "data", data: { type: "section", key: "notes", items: [{ id: "n", entity: "note", title: "N" }], count: 1 } },
      { event: "end", data: {} },
    ]),
  );
  const sections = await searchKnowledgeServer({ text: "x" });
  expect(sections.find((s) => s.key === "notes")?.items[0].title).toBe("N");
});
