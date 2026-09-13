/**
 * The artifacts panel is never blank: every state names itself — no session,
 * loading, a failed read (with a retry), an empty session, or the tree.
 * Row shapes are the live `files.files` rows the panel reads (verified
 * 2026-09-12 against session bf9b08ed-c6a4-4471-b32b-11bddee56787).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationArtifactsPanel } from "./ConversationArtifactsPanel";
import type { CodingSessionArtifactsState } from "../artifacts/useCodingSessionArtifacts";
import type { CodingSessionArtifactRow } from "../artifacts/service";

jest.mock("@/features/files/components/preview/openFilePreview", () => ({
  openFilePreview: jest.fn(),
}));
jest.mock("@/features/files/api/files", () => ({ downloadFile: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

function state(
  partial: Partial<CodingSessionArtifactsState>,
): CodingSessionArtifactsState {
  return { state: "ready", rows: [], error: null, reload: jest.fn(), ...partial };
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
