import { insertTextAtTextareaCursor } from "./text-insertion";

describe("insertTextAtTextareaCursor", () => {
  it("routes the complete next value through a controlled field callback", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "alpha omega";
    textarea.setSelectionRange(6, 6);
    const onValueChange = jest.fn();

    expect(
      insertTextAtTextareaCursor(textarea, "linked ", onValueChange),
    ).toBe(true);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("alpha linked omega");
  });

  it("mutates an uncontrolled field at its selected range", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "alpha omega";
    textarea.setSelectionRange(6, 11);

    expect(insertTextAtTextareaCursor(textarea, "linked")).toBe(true);

    expect(textarea.value).toBe("alpha linked");
    expect(textarea.selectionStart).toBe(12);
    expect(textarea.selectionEnd).toBe(12);
  });
});
