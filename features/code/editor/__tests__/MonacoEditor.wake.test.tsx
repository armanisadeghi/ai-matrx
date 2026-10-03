/**
 * The Monaco wrapper survives being hidden and shown (React `<Activity>` —
 * a sleeping board tile, a hidden tab) and two editors of one file.
 *
 * SUT: the real `MonacoEditor` over the real `@monaco-editor/react`
 * `<Editor>`; only Monaco itself (the CDN-loaded engine behind
 * `@monaco-editor/loader`) is a recording stand-in that creates a real DOM
 * node per editor instance and keeps models by path, as Monaco does.
 *
 * Break it catches: `<Editor>` disposes its instance when its effects detach
 * and, on show, its state still says "ready", so it never creates another —
 * the pane went blank after every hide/show.
 */
import { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeModel {
  uri: { path: string };
  value: string;
  disposed: boolean;
  listeners: Array<() => void>;
}
const models = new Map<string, FakeModel>();
const modelsCreated: string[] = [];
let editorsCreated = 0;

function fakeEditor(container: HTMLElement, initial: FakeModel) {
  let model = initial;
  const node = document.createElement("textarea");
  node.dataset.testid = "monaco-instance";
  node.value = model.value;
  container.appendChild(node);
  const sync = () => {
    node.value = model.value;
  };
  model.listeners.push(sync);
  editorsCreated += 1;
  return {
    getModel: () => (model.disposed ? null : { ...model, getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: model.value.length + 1 }) }),
    getValue: () => model.value,
    setModel: (next: FakeModel) => {
      model = next;
      sync();
    },
    executeEdits: (_src: string, edits: Array<{ text: string }>) => {
      model.value = edits[0].text;
      model.listeners.forEach((l) => l());
      return true;
    },
    onDidChangeModelContent: (cb: () => void) => {
      model.listeners.push(cb);
      return { dispose: () => undefined };
    },
    pushUndoStop: () => undefined,
    getOption: () => false,
    updateOptions: () => undefined,
    addCommand: () => undefined,
    restoreViewState: () => undefined,
    saveViewState: () => null,
    revealLine: () => undefined,
    layout: () => undefined,
    focus: () => undefined,
    dispose: () => {
      node.remove();
    },
  };
}

const fakeMonaco = {
  Uri: { parse: (path: string) => ({ path }) },
  KeyMod: { CtrlCmd: 1, Shift: 2 },
  KeyCode: { KeyS: 3, KeyL: 4 },
  editor: {
    EditorOption: { readOnly: 1 },
    getModel: (uri: { path: string }) => {
      const m = models.get(uri.path);
      return m && !m.disposed ? m : null;
    },
    createModel: (value: string, _language: string, uri: { path: string }) => {
      const m: FakeModel = {
        uri,
        value,
        disposed: false,
        listeners: [],
        // @ts-expect-error — the stand-in model's dispose, called by <Editor>.
        dispose() {
          m.disposed = true;
        },
      };
      models.set(uri.path, m);
      modelsCreated.push(uri.path);
      return m;
    },
    create: (container: HTMLElement, opts: { model: FakeModel }) => fakeEditor(container, opts.model),
    setTheme: () => undefined,
    setModelLanguage: () => undefined,
    onDidChangeMarkers: () => ({ dispose: () => undefined }),
    getModelMarkers: () => [],
  },
};

jest.mock("@monaco-editor/loader", () => ({
  __esModule: true,
  default: {
    config: () => undefined,
    init: () => {
      const p = Promise.resolve(fakeMonaco) as Promise<typeof fakeMonaco> & { cancel: () => void };
      p.cancel = () => undefined;
      return p;
    },
  },
}));
jest.mock("../monaco-config", () => ({ configureMonaco: () => Promise.resolve() }));
jest.mock("../useMonacoTheme", () => ({ useMonacoTheme: () => false }));
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));

import { MonacoEditor } from "../MonacoEditor";

let root: Root;
let host: HTMLDivElement;

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => {});
}

function render(ui: React.ReactNode) {
  return act(async () => root.render(ui));
}

const instances = () => Array.from(host.querySelectorAll<HTMLTextAreaElement>("[data-testid=monaco-instance]"));

beforeEach(() => {
  models.clear();
  modelsCreated.length = 0;
  editorsCreated = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const PATH = "cloud-file:/move-in-checklist";
const TEXT = "Unit 4B move-in: keys, garage remote, mailbox key.";

function editor(mode: "visible" | "hidden", keepModel = true) {
  return (
    <Activity mode={mode}>
      <MonacoEditor value={TEXT} language="markdown" path={PATH} keepModel={keepModel} />
    </Activity>
  );
}

it("shows a live editor again after it is hidden and shown — never a blank pane", async () => {
  await render(editor("visible"));
  await settle();
  expect(instances()).toHaveLength(1);
  expect(instances()[0].value).toBe(TEXT);

  await render(editor("hidden"));
  await settle();
  await render(editor("visible"));
  await settle();

  const shown = instances();
  expect(shown).toHaveLength(1);
  expect(shown[0].value).toBe(TEXT);
});

it("keeps the same model (and with it the undo history) across hide and show", async () => {
  await render(editor("visible"));
  await settle();
  await render(editor("hidden"));
  await settle();
  await render(editor("visible"));
  await settle();

  expect(modelsCreated).toEqual([PATH]);
  expect(models.get(PATH)?.disposed).toBe(false);
  expect(editorsCreated).toBe(2);
});

it("two editors of one path share one model, and closing one leaves the other working", async () => {
  await render(
    <>
      <MonacoEditor key="a" value={TEXT} language="markdown" path={PATH} keepModel />
      <MonacoEditor key="b" value={TEXT} language="markdown" path={PATH} keepModel />
    </>,
  );
  await settle();
  expect(instances()).toHaveLength(2);
  expect(modelsCreated).toEqual([PATH]);

  await render(<MonacoEditor key="b" value={TEXT} language="markdown" path={PATH} keepModel />);
  await settle();
  expect(models.get(PATH)?.disposed).toBe(false);
  expect(instances()).toHaveLength(1);
  expect(instances()[0].value).toBe(TEXT);
});
