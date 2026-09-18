/**
 * XT-FIX-5 / FE2 — THE HOOK READS EVERY CLAIMED SESSION.
 *
 * Artifact rows are keyed by ONE `metadata.cli_session_id`, and this hook used
 * to take ONE id. On a handed-off conversation that made the originating tool's
 * artifacts structurally unreachable (verifier V-XT-5 § A7): the screen showed
 * one tool's files as the conversation's whole set.
 *
 * The forcing function is the mocked service door: the test asserts WHICH
 * session ids were actually requested and that each tool's rows come back under
 * that tool, so a hook that reads the newest binding only cannot pass. One
 * tool's failed read is asserted separately — a partial set is stated, never
 * silently rendered as complete.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useCodingSessionArtifacts,
  type CodingSessionArtifactsState,
} from "../useCodingSessionArtifacts";
import type { ArtifactSessionRef } from "../../bindingPlurality";
import type { CodingSessionArtifactRow } from "../service";

const fetchArtifacts = jest.fn();
jest.mock("../service", () => ({
  CODING_SESSION_ARTIFACT_KIND: "coding_session_artifact",
  fetchCodingSessionArtifacts: (id: string) => fetchArtifacts(id),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CLAUDE_SESSION = "bf9b08ed-c6a4-4471-b32b-11bddee56787";
const CODEX_SESSION = "vxt5-codexclaim-1789515658";

function row(id: string): CodingSessionArtifactRow {
  return { id, file_name: id, file_path: id } as unknown as CodingSessionArtifactRow;
}

let latest: CodingSessionArtifactsState | null = null;

function Probe({ sessions }: { sessions: readonly ArtifactSessionRef[] }) {
  latest = useCodingSessionArtifacts(sessions);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(sessions: readonly ArtifactSessionRef[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Probe sessions={sessions} />);
  });
  if (!latest) throw new Error("hook produced no state");
  return latest;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  fetchArtifacts.mockReset();
  latest = null;
});

const TWO_TOOLS: ArtifactSessionRef[] = [
  { provider: "codex", providerSessionId: CODEX_SESSION },
  { provider: "claude_code", providerSessionId: CLAUDE_SESSION },
];

test("every claimed session is requested, and its rows stay under its tool", async () => {
  fetchArtifacts.mockImplementation((id: string) =>
    Promise.resolve(
      id === CODEX_SESSION ? [row("codex-plan.md")] : [row("a.md"), row("b.md")],
    ),
  );

  const state = await render(TWO_TOOLS);

  expect(fetchArtifacts.mock.calls.map(([id]) => id).sort()).toEqual(
    [CLAUDE_SESSION, CODEX_SESSION].sort(),
  );
  expect(state.state).toBe("ready");
  // The merged set is the WHOLE conversation's artifacts…
  expect(state.rows.map((r) => r.id).sort()).toEqual([
    "a.md",
    "b.md",
    "codex-plan.md",
  ]);
  // …and every row is still attributable to the tool that produced it.
  expect(
    state.groups.map((g) => [g.provider, g.rows.map((r) => r.id)]),
  ).toEqual([
    ["codex", ["codex-plan.md"]],
    ["claude_code", ["a.md", "b.md"]],
  ]);
  expect(state.error).toBe(null);
});

test("one tool's failed read is stated and never hides the other tool's rows", async () => {
  fetchArtifacts.mockImplementation((id: string) =>
    id === CODEX_SESSION
      ? Promise.reject(new Error("permission denied"))
      : Promise.resolve([row("a.md")]),
  );
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  const state = await render(TWO_TOOLS);

  expect(state.state).toBe("ready");
  expect(state.error).toContain("1 of 2 tools");
  expect(state.groups[0].state).toBe("error");
  expect(state.groups[0].error).toBe("permission denied");
  expect(state.groups[1].rows.map((r) => r.id)).toEqual(["a.md"]);
  errors.mockRestore();
});

test("every read failing is an error, not an empty artifact list", async () => {
  fetchArtifacts.mockRejectedValue(new Error("permission denied"));
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  const state = await render(TWO_TOOLS);

  expect(state.state).toBe("error");
  expect(state.rows).toEqual([]);
  errors.mockRestore();
});

test("no claimed session is idle, and reads nothing at all", async () => {
  const state = await render([]);
  expect(state.state).toBe("idle");
  expect(state.groups).toEqual([]);
  expect(fetchArtifacts).not.toHaveBeenCalled();
});
