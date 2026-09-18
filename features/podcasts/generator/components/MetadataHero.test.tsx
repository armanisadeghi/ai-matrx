import { act } from "react";
import { createRoot } from "react-dom/client";

import { INITIAL_RUN_STATE } from "../types";
import { MetadataHero } from "./MetadataHero";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MetadataHero", () => {
  it("does not render the composition placeholder after a terminal error without metadata", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() =>
      root.render(<MetadataHero state={{ ...INITIAL_RUN_STATE, status: "error" }} />),
    );

    expect(container.querySelector('[aria-label="Composing the episode"]')).toBeNull();
    expect(container.textContent).not.toContain("Composing the episode");

    act(() => root.unmount());
  });

  it("keeps the composition placeholder while metadata is genuinely pending", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() =>
      root.render(<MetadataHero state={{ ...INITIAL_RUN_STATE, status: "running" }} />),
    );

    expect(container.querySelector('[aria-label="Composing the episode"]')).not.toBeNull();

    act(() => root.unmount());
  });
});
