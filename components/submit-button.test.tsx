import { renderToStaticMarkup } from "react-dom/server";
import { useFormStatus } from "react-dom";

import { SubmitButton } from "./submit-button";

jest.mock("react-dom", () => ({
  ...jest.requireActual<typeof import("react-dom")>("react-dom"),
  useFormStatus: jest.fn(),
}));

const mockedUseFormStatus = jest.mocked(useFormStatus);

function renderPendingButton(label: string, pendingText: string): HTMLElement {
  mockedUseFormStatus.mockReturnValue({
    pending: true,
    data: null,
    method: null,
    action: null,
  });

  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <SubmitButton pendingText={pendingText}>
      <svg aria-hidden="true" data-provider-icon />
      <span>{label}</span>
    </SubmitButton>,
  );

  const button = host.querySelector("button");
  if (!button) {
    throw new Error("SubmitButton did not render a button");
  }
  return button;
}

describe("SubmitButton pending state", () => {
  it.each([
    ["Google", "Google sign-in…"],
    ["Create account", "Creating your account and preparing your workspace…"],
  ])(
    "preserves the %s button footprint while exposing %s only to assistive technology",
    (label, pendingText) => {
      const button = renderPendingButton(label, pendingText);
      const preservedContent = button.querySelector(
        '[data-slot="submit-button-content"]',
      );
      const status = button.querySelector('[role="status"]');

      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.classList.contains("min-h-11")).toBe(true);
      expect(preservedContent?.textContent).toBe(label);
      expect(preservedContent?.getAttribute("aria-hidden")).toBe("true");
      expect(preservedContent?.classList.contains("invisible")).toBe(true);
      expect(status?.textContent).toBe(pendingText);
      expect(status?.classList.contains("sr-only")).toBe(true);
      expect(button.querySelector('[data-slot="submit-button-spinner"]')).not.toBeNull();
    },
  );

  it("keeps the normal label visible and the button enabled while idle", () => {
    mockedUseFormStatus.mockReturnValue({
      pending: false,
      data: null,
      method: null,
      action: null,
    });

    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>,
    );

    const button = host.querySelector("button");
    const content = button?.querySelector('[data-slot="submit-button-content"]');

    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-busy")).toBe("false");
    expect(button?.classList.contains("min-h-11")).toBe(true);
    expect(content?.textContent).toBe("Sign in");
    expect(content?.hasAttribute("aria-hidden")).toBe(false);
    expect(button?.querySelector('[role="status"]')).toBeNull();
  });
});
