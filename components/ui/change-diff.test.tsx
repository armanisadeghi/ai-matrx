import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeDiff } from "./change-diff";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChangeDiff", () => {
  it("renders long proposed block values without a visual clamp", () => {
    const tail = "THE END OF THE PROPOSED VALUE";
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Proposed value",
            after: `${"A full sentence that must remain reviewable. ".repeat(20)}${tail}`,
            block: true,
          },
        ]}
      />,
    );

    expect(markup).toContain(tail);
    expect(markup).not.toContain("line-clamp");
  });

  it("wraps inline values instead of truncating them", () => {
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Name",
            before: "The complete original value",
            after: "The complete proposed replacement value",
          },
        ]}
      />,
    );

    expect(markup).not.toContain("truncate");
    expect(markup).toContain("The complete proposed replacement value");
  });

  it("defaults block updates to the combined diff and keeps both source views available", () => {
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Description",
            before: "Remove this sentence.",
            after: "Add this sentence.",
            block: true,
          },
        ]}
      />,
    );

    expect(markup).toContain('data-state="active"');
    expect(markup).toContain("Diff");
    expect(markup).toContain("New");
    expect(markup).toContain("Original");
    expect(markup).toContain('data-diff-line-type="removed"');
    expect(markup).toContain('data-diff-line-type="added"');
  });

  it("shows removals for cleared block values and does not invent an original for additions", () => {
    const cleared = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Description",
            before: "This text is being removed.",
            after: null,
            block: true,
          },
        ]}
      />,
    );
    const added = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Description",
            after: "This is new.",
            block: true,
          },
        ]}
      />,
    );

    expect(cleared).toContain("This text is being removed.");
    expect(cleared).toContain('data-diff-line-type="removed"');
    expect(added).toContain("This is new.");
    expect(added).not.toContain("Original");
    expect(added).not.toContain("data-matrx-diff");
  });

  it("diffs raw empty values instead of placeholder text", () => {
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Description",
            before: null,
            after: "New content.",
            block: true,
          },
        ]}
      />,
    );

    expect(markup).toContain("New content.");
    expect(markup).not.toContain("empty</span>");
  });

  it("renders whitespace-only source views faithfully instead of calling them cleared", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => {
        root.render(
          <ChangeDiff
            fields={[
              {
                label: "Description",
                before: " \n",
                after: "\t",
                block: true,
              },
            ]}
          />,
        );
      });

      const tab = (label: string) =>
        [...container.querySelectorAll("button")].find(
          (button) => button.textContent === label,
        );

      act(() => {
        tab("New")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.textContent).toContain("Whitespace only");
      expect(container.textContent).not.toContain("cleared");
      expect(container.querySelector("pre")?.textContent).toBe("\t");

      act(() => {
        tab("Original")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      expect(container.textContent).toContain("Whitespace only");
      expect(container.textContent).not.toContain("empty");
      expect(container.querySelector("pre")?.textContent).toBe(" \n");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
