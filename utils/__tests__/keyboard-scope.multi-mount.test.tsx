/**
 * A /board mounts 10–15 full pages at once; side panels and windows mount
 * more. An undo shortcut a surface puts on `document` runs once PER MOUNT,
 * so one ⌘Z used to undo every mounted note / composer / agent message at
 * once (and steal ⌘Z from the board). Each mount must answer only keys
 * pressed inside its own editor (@ai-matrx/kit/keyboard-scope).
 *
 * Mounts two of each undo hook side by side, presses ⌘Z in ONE editor, and
 * asserts exactly one undo, for that editor only — and none at all when the
 * key is pressed outside every editor.
 */
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatched: Array<{ type: string; payload?: unknown }> = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: { type: string; payload?: unknown }) => {
    dispatched.push(action);
    return action;
  },
  // Every stack has something to undo and to redo.
  useAppSelector: () => true,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

import { useNoteUndoRedo } from "@/features/notes/hooks/useNoteUndoRedo";
import { useInstanceInputUndoRedo } from "@ai-matrx/chat/agents/hooks/useInstanceInputUndoRedo";
import { useAgentUndoRedo } from "@/features/agents/hooks/useAgentUndoRedo";

type HookName = "note" | "composer" | "agent";

function Editor({ hook, id }: { hook: HookName; id: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const scope = () => ref.current;
  if (hook === "note") useNoteUndoRedo({ noteId: id, scope });
  if (hook === "composer") useInstanceInputUndoRedo({ conversationId: id, scope });
  if (hook === "agent") useAgentUndoRedo({ agentId: id, scope });
  return <textarea ref={ref} data-testid={`editor-${id}`} />;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

function byTestId(id: string): Element {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no element ${id}`);
  return el;
}

function pressUndo(target: Element) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function undoActions() {
  return dispatched.filter((a) => /undo/i.test(a.type));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  dispatched.length = 0;
});

describe.each<HookName>(["note", "composer", "agent"])(
  "%s undo with two mounted editors",
  (hook) => {
    it("⌘Z in one editor undoes that editor once — never the other", () => {
      render(
        <>
          <Editor hook={hook} id="first" />
          <Editor hook={hook} id="second" />
        </>,
      );
      pressUndo(byTestId("editor-first"));
      const undos = undoActions();
      expect(undos).toHaveLength(1);
      expect(JSON.stringify(undos[0].payload)).toContain("first");
    });

    it("⌘Z pressed outside every editor (the board) undoes nothing", () => {
      render(
        <>
          <Editor hook={hook} id="first" />
          <Editor hook={hook} id="second" />
          <button data-testid="board">board</button>
        </>,
      );
      pressUndo(byTestId("board"));
      pressUndo(document.body);
      expect(undoActions()).toHaveLength(0);
    });
  },
);

describe("surfaceOwnsKey — page-level surfaces", () => {
  function keyOn(target: EventTarget): Event {
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    Object.defineProperty(event, "target", { value: target });
    return event;
  }

  it("a standalone page answers an unfocused key; a board tile never does", async () => {
    const { surfaceOwnsKey } = await import("@ai-matrx/kit/keyboard-scope");
    const page = document.createElement("div");
    const tile = document.createElement("div");
    tile.setAttribute("data-board-body", "");
    const tilePage = document.createElement("div");
    tile.appendChild(tilePage);
    document.body.append(page, tile);
    try {
      expect(surfaceOwnsKey(keyOn(document.body), page)).toBe(true);
      expect(surfaceOwnsKey(keyOn(document.body), tilePage)).toBe(false);
      const field = document.createElement("input");
      tilePage.appendChild(field);
      expect(surfaceOwnsKey(keyOn(field), tilePage)).toBe(true);
      expect(surfaceOwnsKey(keyOn(field), page)).toBe(false);
    } finally {
      page.remove();
      tile.remove();
    }
  });
});
