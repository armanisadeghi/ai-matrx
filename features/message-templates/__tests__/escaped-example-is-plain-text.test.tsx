/**
 * @jest-environment jsdom
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TemplateRichText } from "../components/TemplateRichText";

jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({
  // The real engine draws any `{{x}}` as a variable chip; the stand-in does the same so an
  // escaped example that leaks into it would show up as a chip.
  RichContent: ({ source }: { source: string }) => (
    <p>{source.replace(/\{\{([^}]+)\}\}/g, "[variable:$1]")}</p>
  ),
}));

describe("an escaped example in a template body", () => {
  it("shows as literal {{name}} and only the unescaped field becomes a chip", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(
        <TemplateRichText text={"Use {{party.first_name}} to greet. Example: \\{{party.first_name}}"} show="example" />,
      );
    });
    expect(container.querySelectorAll("[data-merge-field]")).toHaveLength(1);
    expect(container.textContent).toBe("Use Jordan to greet. Example: {{party.first_name}}");
  });
});
