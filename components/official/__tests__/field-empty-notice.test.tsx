import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "../Field";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom cannot evaluate `:has()` / `:placeholder-shown`, so this pins the CLASS
// contract that makes the notice conditional; the live proof is page:look.
describe("Field — the empty notice is conditional on a visible example", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders the notice hidden, shown only when the field has a placeholder-shown control", () => {
    act(() =>
      root.render(
        <Field label="Name" htmlFor="n" required value="">
          <input id="n" />
        </Field>,
      ),
    );
    const notice = host.querySelector('[data-slot="field-empty-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.className).toContain("hidden");
    expect(notice?.className).toContain("group-has-[:placeholder-shown]/field:flex");
    expect(host.firstElementChild?.className).toContain("group/field");
  });

  it("an error still shows unconditionally", () => {
    act(() =>
      root.render(
        <Field label="Name" htmlFor="n" required value="" error="Needed">
          <input id="n" />
        </Field>,
      ),
    );
    expect(host.textContent).toContain("Needed");
    expect(host.querySelector('[data-slot="field-empty-notice"]')).toBeNull();
  });
});
