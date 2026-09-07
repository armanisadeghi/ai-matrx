import { act, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import InputTextareaLabPage from "./page.dev";

jest.mock("@/components/official/ProInput", () => ({
  ProInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("InputTextareaLabPage", () => {
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

  it("makes EnterInput submission and DeleteInput behavior observable", () => {
    act(() => root.render(<InputTextareaLabPage />));

    const enterInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="EnterInput"]',
    );
    const deleteInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="DeleteInput"]',
    );
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete field"]',
    );

    expect(enterInput).not.toBeNull();
    expect(deleteInput?.value).toBe("delete me");
    expect(deleteButton).not.toBeNull();

    act(() => {
      if (!enterInput) throw new Error("EnterInput was not rendered");
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(enterInput, "submitted value");
      enterInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      enterInput?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(container.textContent).toContain("Enter handled: submitted value");

    act(() => deleteButton?.click());
    expect(deleteInput?.value).toBe("");
    expect(container.textContent).toContain("Field deleted.");
  });
});
