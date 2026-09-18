import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ContextItemsReadyPreview } from "./OrgScopeTypeSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scopeType = {
  id: "scope-type-1",
  label_singular: "Known problem",
  label_plural: "Known Problems",
} as Parameters<typeof ContextItemsReadyPreview>[0]["scopeType"];

const contextItem = {
  id: "context-item-1",
  display_name: "Title",
} as Parameters<typeof ContextItemsReadyPreview>[0]["items"][number];

describe("ContextItemsReadyPreview", () => {
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

  it("starts the inline add flow when either placeholder row is clicked", async () => {
    const onAdd = jest.fn();

    await act(async () => {
      root.render(
        <ContextItemsReadyPreview
          scopeType={scopeType}
          items={[contextItem]}
          columns={[contextItem]}
          overflowCount={0}
          orgSlugOrId="ai-matrx"
          nameColorClass="text-primary"
          onAdd={onAdd}
        />,
      );
    });

    const placeholderRows = container.querySelectorAll("tbody tr");
    expect(placeholderRows).toHaveLength(2);

    act(() => {
      placeholderRows[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      placeholderRows[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAdd).toHaveBeenCalledTimes(2);
  });
});
