import { act } from "react";
import { createRoot } from "react-dom/client";

import { INITIAL_RUN_STATE } from "../types";
import { MediaOptionsGrid } from "./MediaOptionsGrid";

jest.mock("./AssetCard", () => ({
  AssetCard: ({ label }: { label: string }) => <div>{label}</div>,
}));
jest.mock("./AddAssetCard", () => ({
  AddAssetCard: () => <div>Add asset</div>,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MediaOptionsGrid", () => {
  it.each([
    ["pending", false],
    ["running", false],
    ["done", true],
    ["failed", true],
  ] as const)(
    "%s media is %s after a terminal run failure",
    (status, shouldRender) => {
      const container = document.createElement("div");
      const root = createRoot(container);

      act(() =>
        root.render(
          <MediaOptionsGrid
            state={{
              ...INITIAL_RUN_STATE,
              status: "error",
              images: [
                {
                  index: 0,
                  kind: "image",
                  prompt: "A real asset slot",
                  url:
                    status === "done" ? "https://cdn.example/cover.png" : null,
                  status,
                },
              ],
            }}
            interactive={false}
            selectedCoverUrl={null}
            onSelectCover={() => undefined}
          />,
        ),
      );

      if (shouldRender) {
        expect(container.textContent).toContain("Cover art options");
        expect(container.textContent).toContain("Style 1");
      } else {
        expect(container.textContent).toBe("");
      }

      act(() => root.unmount());
    },
  );
});
