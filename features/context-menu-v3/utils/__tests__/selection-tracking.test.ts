import {
  captureTextareaSelection,
  getEditableSelectionOffsets,
  restoreTextareaSelection,
  spliceInputValue,
} from "../selection-tracking";

describe("editable selection tracking", () => {
  it("keeps a text input's partial selection", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "abcdef";
    input.setSelectionRange(2, 4);

    expect(captureTextareaSelection(input).text).toBe("cd");
    expect(getEditableSelectionOffsets(input)).toEqual({ start: 2, end: 4 });
  });

  it("uses a number input's entire value and never restores an unsupported range", () => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = "500";
    const selectRange = jest.spyOn(input, "setSelectionRange");

    expect(captureTextareaSelection(input).text).toBe("500");
    expect(getEditableSelectionOffsets(input)).toEqual({ start: 0, end: 3 });
    restoreTextareaSelection(input, 0, 3, 0);
    expect(() => spliceInputValue(input, 0, 3, "750")).not.toThrow();
    expect(input.value).toBe("750");
    expect(selectRange).not.toHaveBeenCalled();
  });
});
