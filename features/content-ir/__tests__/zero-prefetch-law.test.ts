/**
 * 🚨 THE ZERO-PREFETCH LAW (Arman, 2026-08-31) — the guard.
 *
 * "If I never get a `__kind` key coming into any of the content I render …
 * there should be absolutely no record of anything related to Content IR
 * having ever been fetched for me or on my behalf. The first time anything
 * should ever even be considered is when we see that `__kind` key."
 *
 * Concretely: a session that never meets a kind SIGNAL — a `__kind` key, a
 * registered detection surface resolving a slug, or a caller-declared
 * expected kind — performs ZERO Content-IR fetches. Not the light catalog,
 * not components, not per-slug reads. Plain JSON fences, markdown, whole
 * pages of content: nothing. Detection itself needs no fetch (the compiled
 * surface bootstrap and the parser's own `__kind` reader are in the bundle),
 * and the hardcoded loading components cover the wait once a signal DOES
 * arrive and the per-slug fetch begins.
 *
 * Both halves proven failing-then-passing against the pre-law code, which
 * warmed both registries the moment ANY JSON region opened:
 *  - the live stream path (StreamBlockAccumulator.irOpenRegion), and
 *  - the DB-reload/static path (memoizedRegionEnvelope).
 */

import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { memoizedRegionEnvelope } from "../registry/region-envelope-memo";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { chunkText } from "./seeded-random";

function spies() {
  return {
    kindWarm: jest
      .spyOn(kindRegistry, "ensureWarm")
      .mockResolvedValue(undefined),
    kindSchema: jest
      .spyOn(kindRegistry, "requestSchema")
      .mockImplementation(() => undefined),
    compWarm: jest
      .spyOn(componentRegistry, "ensureWarm")
      .mockResolvedValue(undefined),
    compRequest: jest
      .spyOn(componentRegistry, "requestComponent")
      .mockImplementation(() => undefined),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

function runAccumulator(document: string): void {
  const dispatch = (action: unknown) => action;
  const accumulator = new StreamBlockAccumulator("req_zero_prefetch", (p) => ({
    type: "test/upsert",
    payload: p,
  }));
  for (const chunk of chunkText(document, 13, 7)) {
    accumulator.ingest(chunk, dispatch as never);
  }
  accumulator.finalize(dispatch as never);
}

describe("THE ZERO-PREFETCH LAW — live stream (accumulator)", () => {
  it("a kindless JSON fence fetches NOTHING", () => {
    const s = spies();
    runAccumulator(
      'Here is plain data:\n\n```json\n{"hello": 1, "items": [1, 2, 3]}\n```\n\nDone.\n',
    );
    expect(s.kindWarm).not.toHaveBeenCalled();
    expect(s.compWarm).not.toHaveBeenCalled();
    expect(s.kindSchema).not.toHaveBeenCalled();
    expect(s.compRequest).not.toHaveBeenCalled();
  });

  it("prose and markdown with no structure fetch NOTHING", () => {
    const s = spies();
    runAccumulator(
      "# A heading\n\nJust text, a list:\n\n- one\n- two\n\nAnd a `code span`.\n",
    );
    expect(s.kindWarm).not.toHaveBeenCalled();
    expect(s.compWarm).not.toHaveBeenCalled();
  });

  it("a __kind signal triggers the warm AND the per-slug fetch", () => {
    const s = spies();
    runAccumulator(
      '```json\n{"__kind": "flashcard_set", "title": "T", "cards": [{"front": "f", "back": "b"}]}\n```\n',
    );
    expect(s.kindWarm).toHaveBeenCalled();
    expect(s.compWarm).toHaveBeenCalled();
    expect(s.kindSchema).toHaveBeenCalledWith("flashcard_set");
    expect(s.compRequest).toHaveBeenCalledWith("flashcard_set", "web", "output");
  });
});

describe("THE ZERO-PREFETCH LAW — DB reload / static split (region memo)", () => {
  it("a kindless complete JSON object fetches NOTHING", () => {
    const s = spies();
    const envelope = memoizedRegionEnvelope('{"plain": true, "n": 42}');
    expect(envelope).not.toBeNull();
    expect(envelope?.root.kind).toBe("");
    expect(s.kindWarm).not.toHaveBeenCalled();
    expect(s.compWarm).not.toHaveBeenCalled();
  });

  it("a __kind object triggers the warm", () => {
    const s = spies();
    const envelope = memoizedRegionEnvelope(
      '{"__kind": "flashcard_set", "title": "T", "cards": []}',
    );
    expect(envelope?.root.kind).toBe("flashcard_set");
    expect(s.kindWarm).toHaveBeenCalled();
    expect(s.compWarm).toHaveBeenCalled();
  });
});
