/**
 * buildEditableWidgetHandle — capability advertisement.
 *
 * The handle must expose ONLY methods this surface can actually service
 * (the per-turn assembler advertises exactly the present subset to the
 * agent). A method that exists but can't write makes the agent THINK it
 * edited — the silent-broken class this guards against.
 */

import { buildEditableWidgetHandle } from "../widget-handle";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

const scopeWith = (content: string) => (): ApplicationScope =>
  ({ content }) as unknown as ApplicationScope;

describe("buildEditableWidgetHandle capability advertisement", () => {
  it("returns null when the surface exposes no way to write", () => {
    expect(buildEditableWidgetHandle({})).toBeNull();
    expect(
      buildEditableWidgetHandle({ getApplicationScope: scopeWith("x") }),
    ).toBeNull();
    // Insert callbacks alone are not a write path for replace — no handle.
    expect(
      buildEditableWidgetHandle({
        onTextInsertBefore: () => {},
        onTextInsertAfter: () => {},
      }),
    ).toBeNull();
  });

  it("onTextReplace alone advertises replace but NOT inserts or whole-content ops", () => {
    const handle = buildEditableWidgetHandle({ onTextReplace: () => {} });
    expect(handle).not.toBeNull();
    expect(handle!.onTextReplace).toBeDefined();
    // No cursor target and no insert callbacks — inserts must not exist.
    expect(handle!.onTextInsertBefore).toBeUndefined();
    expect(handle!.onTextInsertAfter).toBeUndefined();
    // No read path — prepend/append/patch must not exist.
    expect(handle!.onTextPrepend).toBeUndefined();
    expect(handle!.onTextAppend).toBeUndefined();
    expect(handle!.onTextPatch).toBeUndefined();
  });

  it("onTextReplace + getApplicationScope adds the whole-content ops", () => {
    const writes: string[] = [];
    const handle = buildEditableWidgetHandle({
      onTextReplace: (t) => writes.push(t),
      getApplicationScope: scopeWith("hello world"),
    })!;
    expect(handle.onTextPrepend).toBeDefined();
    expect(handle.onTextAppend).toBeDefined();
    expect(handle.onTextPatch).toBeDefined();
    // Still no inserts — nothing services a cursor position.
    expect(handle.onTextInsertBefore).toBeUndefined();
    expect(handle.onTextInsertAfter).toBeUndefined();

    handle.onTextPrepend!({ text: "A " });
    handle.onTextAppend!({ text: "!" });
    handle.onTextPatch!({ search_text: "world", replacement_text: "matrx" });
    expect(writes).toEqual(["A hello world", "hello world!", "hello matrx"]);
  });

  it("insert callbacks become insert methods and are preferred over the field fallback", () => {
    const before: string[] = [];
    const after: string[] = [];
    const handle = buildEditableWidgetHandle({
      onTextReplace: () => {},
      onTextInsertBefore: (t) => before.push(t),
      onTextInsertAfter: (t) => after.push(t),
    })!;
    handle.onTextInsertBefore!({ text: "b" });
    handle.onTextInsertAfter!({ text: "a" });
    expect(before).toEqual(["b"]);
    expect(after).toEqual(["a"]);
  });

  it("getTextarea alone advertises the full set and writes through the field", () => {
    const el = document.createElement("textarea");
    el.value = "one two";
    const handle = buildEditableWidgetHandle({ getTextarea: () => el })!;
    expect(handle.onTextReplace).toBeDefined();
    expect(handle.onTextInsertBefore).toBeDefined();
    expect(handle.onTextInsertAfter).toBeDefined();
    expect(handle.onTextPrepend).toBeDefined();
    expect(handle.onTextAppend).toBeDefined();
    expect(handle.onTextPatch).toBeDefined();

    handle.onTextReplace!({ text: "replaced" });
    expect(el.value).toBe("replaced");
    handle.onTextPatch!({ search_text: "placed", replacement_text: "worked" });
    expect(el.value).toBe("reworked");
  });

  it("surface onTextReplace wins over the field fallback for full writes", () => {
    const el = document.createElement("textarea");
    el.value = "field";
    const writes: string[] = [];
    const handle = buildEditableWidgetHandle({
      getTextarea: () => el,
      onTextReplace: (t) => writes.push(t),
    })!;
    handle.onTextReplace!({ text: "state" });
    expect(writes).toEqual(["state"]);
    // The controlled owner writes; the raw DOM value is left to React.
    expect(el.value).toBe("field");
  });

  it("whole-content ops throw (not silently no-op) when content is unreadable at call time", () => {
    const handle = buildEditableWidgetHandle({
      onTextReplace: () => {},
      getTextarea: () => null, // advertised via presence, dead at call time
    })!;
    expect(() => handle.onTextPatch!({ search_text: "x", replacement_text: "y" })).toThrow(
      /unreadable/i,
    );
  });
});
