import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MediaActionContext,
  MediaSharePopoverProps,
} from "@ai-matrx/media";

const openShareLinkDialog = jest.fn();

jest.mock(
  "@/features/overlays/openers/shareLinkDialog",
  () => ({ useOpenShareLinkDialog: () => openShareLinkDialog }),
  { virtual: true },
);

jest.mock("@ai-matrx/media/share", () => {
  const React = require("react") as typeof import("react");

  function MockSharePopover(
    props: MediaSharePopoverProps & {
      manageLinks?: (context: MediaActionContext) => void;
    },
  ) {
    return props.manageLinks ? (
      <button type="button" onClick={() => props.manageLinks?.(props.context)}>
        Manage all links
      </button>
    ) : null;
  }

  return {
    MediaSharePopover: MockSharePopover,
    createMediaSharePopover:
      (options: { manageLinks?: (context: MediaActionContext) => void }) =>
      (props: MediaSharePopoverProps) => (
        <MockSharePopover {...props} {...options} />
      ),
  };
});

import ConfiguredSharePopover from "./share-slot-impl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("package-shell media share slot", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openShareLinkDialog.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps Manage all links bound to the durable app overlay owner", () => {
    const context: MediaActionContext = {
      ref: { file_id: "file-123" },
      resolution: null,
    };

    act(() => {
      root.render(
        <ConfiguredSharePopover context={context} onClose={jest.fn()} />,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Manage all links",
    );
    expect(button).toBeDefined();
    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(openShareLinkDialog).toHaveBeenCalledWith({
      resourceId: "file-123",
    });
  });
});
