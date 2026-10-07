import { forwardSmartCodeEditorMount } from "../CodeOrDiffColumn";

describe("Smart Code Editor Monaco host boundary", () => {
  it("forwards the exact callable editor capabilities the surface consumes", () => {
    const editor = {
      getModel: jest.fn(() => null),
      getSelection: jest.fn(() => null),
      getPosition: jest.fn(() => null),
    };
    const mounted = jest.fn();

    forwardSmartCodeEditorMount(editor, mounted);

    expect(mounted).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledWith(editor);
  });

  it("forwards the null unmount signal", () => {
    const mounted = jest.fn();

    forwardSmartCodeEditorMount(null, mounted);

    expect(mounted).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledWith(null);
  });

  it.each([
    ["missing cursor capability", { getModel: () => null, getSelection: () => null }],
    ["non-callable buffer capability", { getModel: true, getSelection: () => null, getPosition: () => null }],
  ])("rejects a non-Monaco host with %s", (_case, editor) => {
    const mounted = jest.fn();

    expect(() => forwardSmartCodeEditorMount(editor, mounted)).toThrow(
      "without the Monaco buffer, selection, and cursor methods",
    );
    expect(mounted).not.toHaveBeenCalled();
  });
});
