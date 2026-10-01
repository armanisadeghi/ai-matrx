/**
 * The inline file editor saves the LAST typed text when it goes away —
 * closed tile, switched tab, page left. Its unmount flush used to live in an
 * effect keyed on `fileId`, whose closure held the text of the render that
 * created it (null, before the bytes loaded), so the save never fired and
 * the edits were lost.
 */
import { act, type ReactNode } from "react";
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
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: { payload?: unknown }) => ({
    unwrap: () => Promise.resolve(action.payload),
  }),
  useAppSelector: () => ({ id: "file-1", fileName: "notes.md" }),
}));
jest.mock("@/features/files/redux/thunks", () => ({
  saveFileNewVersion: (args: { fileId: string; content: string }) => {
    saved.push({ fileId: args.fileId, content: args.content });
    return { type: "files/saveFileNewVersion", payload: args };
  },
}));
jest.mock("@/features/files/redux/selectors", () => ({ selectFileById: () => null }));
jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: () => ({
    blob: { text: () => Promise.resolve("original text") },
    loading: false,
    error: null,
  }),
}));
jest.mock("@/features/files/components/surfaces/FileViewerControlsContext", () => ({
  useFileViewerControls: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

import { CloudFileInlineEditor } from "./CloudFileInlineEditor";

let root: Root;
let host: HTMLDivElement;

async function mount(ui: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
  // Let blob.text() resolve and the editor mount.
  await act(async () => {});
}

afterEach(() => {
  host?.remove();
  saved.length = 0;
  typeInto = null;
});

it("saves the last typed text when the editor unmounts", async () => {
  await mount(<CloudFileInlineEditor fileId="file-1" />);
  expect(typeInto).not.toBeNull();
  await act(async () => typeInto!("first edit"));
  await act(async () => typeInto!("the last thing typed"));
  await act(async () => root.unmount());
  expect(saved).toEqual([{ fileId: "file-1", content: "the last thing typed" }]);
});

it("saves the last typed text on pagehide, once", async () => {
  await mount(<CloudFileInlineEditor fileId="file-1" />);
  await act(async () => typeInto!("typed before leaving"));
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(saved).toEqual([{ fileId: "file-1", content: "typed before leaving" }]);
  await act(async () => root.unmount());
  expect(saved).toHaveLength(1);
});

it("saves nothing when nothing changed", async () => {
  await mount(<CloudFileInlineEditor fileId="file-1" />);
  await act(async () => root.unmount());
  expect(saved).toEqual([]);
});
