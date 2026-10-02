/**
 * The inline file editor keeps the person's text when its effects re-run
 * without a remount — a board tile that sleeps (React `<Activity>` hidden)
 * and wakes re-runs every effect. Its load effect used to reset the text and
 * re-read the old bytes on every run, so a woken tile showed stale text and
 * the next save wrote it over newer work.
 */
import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: Array<{ fileId: string; content: string }> = [];
let typeInto: ((next: string) => void) | null = null;

jest.mock("next/dynamic", () => () =>
  function MonacoStub(props: { value: string; onChange: (next: string) => void }) {
    typeInto = props.onChange;
    return <textarea readOnly value={props.value} data-testid="monaco" />;
  },
);
const mockFile = { id: "file-1", fileName: "notes.md" };
// Mutable so a test can hand the editor NEW bytes for the same file.
const mockBlob: { blob: { text: () => Promise<string> }; loading: boolean; error: null } = {
  blob: { text: () => Promise.resolve("original text") },
  loading: false,
  error: null,
};
const mockDispatch = (action: { payload?: unknown }) => ({
  unwrap: () => Promise.resolve(action.payload),
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => mockFile,
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/files/redux/thunks", () => ({
  saveFileNewVersion: (args: { fileId: string; content: string }) => {
    saved.push({ fileId: args.fileId, content: args.content });
    return { type: "files/saveFileNewVersion", payload: args };
  },
}));
jest.mock("@/features/files/redux/selectors", () => ({ selectFileById: () => null }));
jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: () => ({ ...mockBlob }),
}));
jest.mock("@/features/files/components/surfaces/FileViewerControlsContext", () => ({
  useFileViewerControls: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

import { CloudFileInlineEditor } from "../CloudFileInlineEditor";

let root: Root;
let host: HTMLDivElement;

function ui(mode: "visible" | "hidden"): ReactNode {
  return (
    <Activity mode={mode}>
      <CloudFileInlineEditor fileId="file-1" />
    </Activity>
  );
}

async function settle() {
  await act(async () => {});
  await act(async () => {});
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui("visible")));
  await settle();
}

const editorValue = () => (host.querySelector("[data-testid=monaco]") as HTMLTextAreaElement | null)?.value;

beforeEach(() => {
  mockBlob.blob = { text: () => Promise.resolve("original text") };
});

afterEach(async () => {
  await act(async () => root.unmount());
  host?.remove();
  saved.length = 0;
  typeInto = null;
});

it("a sleep and wake keeps the typed text, saves it once, and does not re-read the old bytes", async () => {
  await mount();
  await act(async () => typeInto!("typed before the tile slept"));

  await act(async () => root.render(ui("hidden")));
  await settle();
  await act(async () => root.render(ui("visible")));
  await settle();

  expect(editorValue()).toBe("typed before the tile slept");
  expect(saved).toEqual([{ fileId: "file-1", content: "typed before the tile slept" }]);
  expect(host.textContent).not.toContain("Unsaved changes");

  // A second sleep does not save the same text again.
  await act(async () => root.render(ui("hidden")));
  await settle();
  expect(saved).toHaveLength(1);
});

it("new bytes for the same file never discard unsaved text", async () => {
  await mount();
  // Hold the save so the text stays unsaved across the re-render.
  await act(async () => typeInto!("unsaved local work"));
  mockBlob.blob = { text: () => Promise.resolve("bytes changed elsewhere") };
  await act(async () => root.render(ui("visible")));
  await settle();
  expect(editorValue()).toBe("unsaved local work");
  expect(host.textContent).toContain("Unsaved changes");
});

it("new bytes for the same file show when nothing is unsaved", async () => {
  await mount();
  expect(editorValue()).toBe("original text");
  mockBlob.blob = { text: () => Promise.resolve("bytes changed elsewhere") };
  await act(async () => root.render(ui("visible")));
  await settle();
  expect(editorValue()).toBe("bytes changed elsewhere");
});
