/** @jest-environment jsdom */
/**
 * Advanced → "Rerank results": the hub's choice reaches the wire as `rerank`; with no
 * choice the request carries none, so the organization's setting decides.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKnowledgeResults } from "../hooks/useKnowledgeResults";
import {
  toServerRequest,
  type KnowledgeQuery,
  type KnowledgeSearchOptions,
  type KnowledgeSearchRunner,
} from "@/features/knowledge/api/knowledgeSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seenOptions: (KnowledgeSearchOptions | undefined)[] = [];
const runner: KnowledgeSearchRunner = async (_q, options) => {
  seenOptions.push(options);
  return [];
};

function Probe({ rerank }: { rerank?: boolean }) {
  useKnowledgeResults({ mode: "find", text: "grant" } as KnowledgeQuery, "live", runner, rerank);
  return null;
}

let root: Root;
beforeEach(() => {
  seenOptions.length = 0;
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

it("the hub's rerank choice reaches the runner, and no choice sends none", async () => {
  await act(async () => root.render(<Probe />));
  expect(seenOptions.at(-1)?.rerank).toBeUndefined();
  await act(async () => root.render(<Probe rerank={false} />));
  expect(seenOptions.at(-1)?.rerank).toBe(false);
  await act(async () => root.render(<Probe rerank />));
  expect(seenOptions.at(-1)?.rerank).toBe(true);
});

it("the wire carries rerank and pass only when chosen", () => {
  const q = { mode: "find", text: "grant" } as KnowledgeQuery;
  expect(toServerRequest(q, false)).not.toHaveProperty("rerank");
  expect(toServerRequest(q, false, "content", false)).toMatchObject({ pass: "content", rerank: false });
});
