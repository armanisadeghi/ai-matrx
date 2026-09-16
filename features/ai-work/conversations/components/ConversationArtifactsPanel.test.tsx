/**
 * The artifacts panel is never blank: every state names itself — no session,
 * loading, a failed read (with a retry), an empty session, or the tree.
 * Row shapes are the live `files.files` rows the panel reads (verified
 * 2026-09-12 against session bf9b08ed-c6a4-4471-b32b-11bddee56787).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationArtifactsPanel } from "./ConversationArtifactsPanel";
import type {
  CodingSessionArtifactGroup,
  CodingSessionArtifactsState,
} from "../artifacts/useCodingSessionArtifacts";
import type { CodingSessionArtifactRow } from "../artifacts/service";

jest.mock("@/features/files/components/preview/openFilePreview", () => ({
  openFilePreview: jest.fn(),
}));
jest.mock("@/features/files/api/files", () => ({ downloadFile: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CLAUDE_SESSION = "bf9b08ed-c6a4-4471-b32b-11bddee56787";
const CODEX_SESSION = "vxt5-codexclaim-1789515658";

function row(relativePath: string, mime: string, size: number) {
  const name = relativePath.split("/").pop() ?? relativePath;
  return {
    id: `id-${relativePath}`,
    created_by: "u",
    updated_by: null,
    version: 1,
    file_path: `coding-sessions/claude_code/bf9b08ed-c6a4-4471-b32b-11bddee56787/${relativePath}`,
    file_name: name,
    mime_type: mime,
    size_bytes: size,
    checksum: null,
    visibility: "private",
    current_version: 1,
    parent_folder_id: null,
    metadata: {
      kind: "coding_session_artifact",
      cli_session_id: "bf9b08ed-c6a4-4471-b32b-11bddee56787",
      provider: "claude_code",
      relative_path: relativePath,
    },
    created_at: "2026-09-12T22:00:00Z",
    updated_at: "2026-09-12T22:00:00Z",
    deleted_at: null,
    organization_id: "org",
    parent_file_id: null,
    derivation_kind: null,
    derivation_metadata: null,
    duplicate_of_file_id: null,
    canonical_processed_document_id: null,
    width: null,
    height: null,
    duration_ms: null,
  } as unknown as CodingSessionArtifactRow;
}

/** One tool's artifacts, the shape the hook returns for a single binding. */
function state(
  partial: Partial<CodingSessionArtifactsState>,
): CodingSessionArtifactsState {
  const base: CodingSessionArtifactsState = {
    state: "ready",
    rows: [],
    groups: [],
    error: null,
    reload: jest.fn(),
    ...partial,
  };
  if (partial.groups) return base;
  return {
    ...base,
    groups: [
      {
        provider: "claude_code",
        providerSessionId: CLAUDE_SESSION,
        state: base.state === "idle" ? "loading" : base.state,
        rows: base.rows,
        error: base.error,
      },
    ],
  };
}

function group(
  provider: string,
  providerSessionId: string,
  partial: Partial<CodingSessionArtifactGroup> = {},
): CodingSessionArtifactGroup {
  return {
    provider,
    providerSessionId,
    state: "ready",
    rows: [],
    error: null,
    ...partial,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(artifacts: CodingSessionArtifactsState, hasSession = true) {
  act(() => {
    root.render(
      <ConversationArtifactsPanel artifacts={artifacts} hasSession={hasSession} />,
    );
  });
}

describe("ConversationArtifactsPanel", () => {
  it("says plainly when the session captured nothing", () => {
    render(state({ state: "ready", rows: [] }));
    expect(container.textContent).toContain(
      "No artifacts captured for this session",
    );
  });

  it("shows the read failure and offers a retry that re-reads", () => {
    const reload = jest.fn();
    render(state({ state: "error", error: "We couldn't load this session's artifacts.", reload }));
    expect(container.textContent).toContain(
      "We couldn't load this session's artifacts.",
    );
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows a loading line while reading and an absence when unbound", () => {
    render(state({ state: "loading" }));
    expect(container.textContent).toContain("Reading artifacts…");
    render(state({ state: "idle" }), false);
    expect(container.textContent).toContain("No provider session is bound");
  });

  it("names the tool even when the conversation has only one", () => {
    render(state({ rows: [row("closed.md", "text/markdown", 10556)] }));
    expect(container.textContent).toContain("From the Claude Code session");
  });

  it("renders the folder tree with counts, sizes, and per-file doors", () => {
    render(
      state({
        rows: [
          row("qd/page/desk-v2.html", "text/html", 49610),
          row("qd/BRIEF.md", "text/markdown", 6302),
          row("closed.md", "text/markdown", 10556),
        ],
      }),
    );
    expect(container.textContent).toContain("3 artifacts");
    // Folder rows carry their recursive counts.
    const folderButtons = [...container.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(folderButtons).toContain("qd2");
    expect(folderButtons).toContain("page1");
    // Every file has a preview/open door, a new-tab link, and a download.
    expect(
      container.querySelector('button[title="Open qd/page/desk-v2.html in a new tab"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[title="Preview qd/BRIEF.md"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/files/f/id-closed.md"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('button[aria-label^="Download "]').length,
    ).toBe(3);
    expect(container.textContent).toContain("48 KB");
  });
});

/**
 * XT-FIX-5 / FE2 — EVERY TOOL'S ARTIFACTS ARE REACHABLE, AND LABELLED.
 *
 * The break: artifact rows are keyed by ONE `metadata.cli_session_id`, and the
 * transcript kept a single provider session id — so on a handed-off
 * conversation one tool's files were presented as the conversation's whole set
 * and the originating tool's were structurally invisible (verifier V-XT-5
 * § A7). A panel that renders one group, drops a tool's name, or lets one
 * failed read pass off a partial set as complete fails here.
 */
describe("ConversationArtifactsPanel over several tools", () => {
  const claudeRows = [
    row("closed.md", "text/markdown", 10556),
    row("qd/BRIEF.md", "text/markdown", 6302),
  ];
  const codexRows = [row("codex/plan.md", "text/markdown", 2048)];

  it("renders BOTH tools' files, each under its own tool name", () => {
    render(
      state({
        rows: [...claudeRows, ...codexRows],
        groups: [
          group("claude_code", CLAUDE_SESSION, { rows: claudeRows }),
          group("codex", CODEX_SESSION, { rows: codexRows }),
        ],
      }),
    );
    const text = container.textContent ?? "";
    // Both tools are named…
    expect(text).toContain("Claude Code");
    expect(text).toContain("Codex");
    // …the whole set is counted and said to be listed per tool…
    expect(text).toContain("3 artifacts across 2 tools");
    // …and every file from BOTH tools has its own door.
    expect(
      container.querySelector('a[href="/files/f/id-closed.md"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/files/f/id-codex%2Fplan.md"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('button[aria-label^="Download "]').length,
    ).toBe(3);
    // Per-tool counts, so neither section reads as the conversation's total.
    expect(text).toContain("2 artifacts");
    expect(text).toContain("1 artifact");
  });

  it("a tool that captured nothing says so beside a tool that captured files", () => {
    render(
      state({
        rows: claudeRows,
        groups: [
          group("claude_code", CLAUDE_SESSION, { rows: claudeRows }),
          group("codex", CODEX_SESSION, { rows: [] }),
        ],
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("No artifacts captured for this session");
    expect(text).toContain("Codex");
    // The tool that DID capture files still shows them.
    expect(
      container.querySelector('a[href="/files/f/id-closed.md"]'),
    ).not.toBeNull();
  });

  it("one tool's failed read never presents the rest as the whole set", () => {
    const reload = jest.fn();
    render(
      state({
        rows: claudeRows,
        error: "1 of 2 tools' artifacts could not be read.",
        reload,
        groups: [
          group("claude_code", CLAUDE_SESSION, { rows: claudeRows }),
          group("codex", CODEX_SESSION, {
            state: "error",
            error: "We couldn't load this session's artifacts.",
          }),
        ],
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("1 of 2 tools' artifacts could not be read.");
    expect(text).toContain("What you see below is not the whole set.");
    // Named at the failure, not only in the aggregate.
    expect(text).toContain("Codex's files are not shown.");
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    );
    act(() => retry?.click());
    expect(reload).toHaveBeenCalled();
  });
});
