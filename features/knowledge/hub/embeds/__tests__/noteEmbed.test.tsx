/**
 * The Note embed: /notes' own editor, opened to READ, with an Edit switch that
 * never grants more than the person has.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => (a: unknown) => a }));
jest.mock("@/features/notes/redux/thunks", () => ({ fetchNoteContent: (id: string) => ({ type: "fetch", id }) }));
const instance = jest.fn();
jest.mock("@/features/notes/hooks/useEmbeddedNoteInstance", () => ({
  useEmbeddedNoteInstance: (...a: unknown[]) => instance(...a),
}));
let access = { loading: false, readOnly: false };
jest.mock("@/features/notes/hooks/useNoteAccess", () => ({ useNoteAccess: () => access }));
jest.mock("@/features/notes/context/NotesInstanceContext", () => ({
  NotesInstanceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/notes/components/NoteContentEditor", () => ({
  NoteContentEditor: (p: { noteId: string; forceReadOnly?: boolean; embedded?: boolean }) => (
    <div data-testid="editor" data-note={p.noteId} data-readonly={String(!!p.forceReadOnly)} data-embedded={String(!!p.embedded)} />
  ),
}));

import { NoteEmbed } from "@/features/knowledge/hub/embeds/NoteEmbed";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  access = { loading: false, readOnly: false };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const editor = () => host.querySelector("[data-testid=editor]") as HTMLElement;
const toggle = () => host.querySelector("[role=switch]") as HTMLButtonElement;

it("opens the /notes editor in read mode; Edit switches it to editing and back", () => {
  act(() => root.render(<NoteEmbed noteId="n1" />));
  expect(instance).toHaveBeenCalledWith("knowledge-peek:n1", "n1");
  expect(editor().dataset.note).toBe("n1");
  expect(editor().dataset.embedded).toBe("true");
  expect(editor().dataset.readonly).toBe("true");
  expect(host.textContent).toContain("Reading.");
  act(() => toggle().click());
  expect(editor().dataset.readonly).toBe("false");
  expect(host.textContent).toContain("Editing");
  act(() => toggle().click());
  expect(editor().dataset.readonly).toBe("true");
});

it("a read-only sharee cannot switch to editing, and is told why", () => {
  access = { loading: false, readOnly: true };
  act(() => root.render(<NoteEmbed noteId="n2" />));
  expect(toggle().disabled).toBe(true);
  act(() => toggle().click());
  expect(editor().dataset.readonly).toBe("true");
  expect(host.textContent).toContain("has not given you edit access");
});
