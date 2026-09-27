/**
 * `@name` means WITHIN a container (plan §2); `entities` are people/places
 * found in content. So `@Ava` is the container named Ava when one exists and
 * an extracted entity only when none does — never silently dropped.
 */

import { parseQueryText, applyChips, resolveMentions } from "../knowledgeQueryText";
import { withMentionResolution } from "../mentionResolution";
import type { KnowledgeQuery } from "../knowledgeSearch";

const AVA = { type: "scope", id: "scope-ava", name: "Ava" };
const findAva = async (name: string) => (name.toLowerCase() === "ava" ? AVA : null);

function queryFor(raw: string): KnowledgeQuery {
  const { text, chips } = parseQueryText(raw);
  return applyChips({ mode: "find", text: text || undefined }, chips);
}

it("parses @Ava as a mention of a container, not as an entity", () => {
  const q = queryFor("contracts @Ava");
  expect(q.within).toEqual([{ type: "mention", name: "Ava" }]);
  expect(q.entities).toBeUndefined();
});

it("@Ava → within the container named Ava when it exists", async () => {
  const q = await resolveMentions(queryFor("contracts @Ava"), findAva);
  expect(q.within).toEqual([AVA]);
  expect(q.entities).toBeUndefined();
  expect(q.text).toBe("contracts");
});

it("@Tesla → entities when no container has that name", async () => {
  const q = await resolveMentions(queryFor("@Tesla #grant-2026"), findAva);
  expect(q.entities).toEqual(["Tesla"]);
  expect(q.within).toEqual([{ type: "tag", name: "grant-2026" }]);
});

it("the live runner wrapper resolves before the runner sees the query", async () => {
  const runner = jest.fn(async () => []);
  await withMentionResolution(runner, findAva)(queryFor('@"Ava"'));
  expect(runner).toHaveBeenCalledWith(
    expect.objectContaining({ within: [AVA] }),
    undefined,
  );
});
