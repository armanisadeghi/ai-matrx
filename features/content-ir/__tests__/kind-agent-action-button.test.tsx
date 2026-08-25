import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockRunAction = jest.fn();
const mockConfirm = jest.fn();

jest.mock("../react/actions/useKindActionRunner", () => ({
  useKindActionRunner: () => mockRunAction,
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

import { KindAgentActionButton } from "../react/actions/KindAgentActionButton";

describe("KindAgentActionButton confirmation gate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockConfirm.mockReset();
    mockRunAction.mockReset();
    mockRunAction.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderButton(
    confirmation?: React.ComponentProps<
      typeof KindAgentActionButton
    >["confirmation"],
  ) {
    await act(async () => {
      root.render(
        <KindAgentActionButton
          agentId="agent-1"
          label="Generate video"
          variables={{ video_description: "A calm ocean" }}
          llmOverrides={{ aspect_ratio: "16:9", duration_seconds: 8 }}
          confirmation={confirmation}
        />,
      );
    });
  }

  async function clickButton() {
    const button = container.querySelector("button");
    if (!button) throw new Error("button did not render");
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  it("does not launch when the user declines", async () => {
    mockConfirm.mockResolvedValue(false);
    await renderButton({
      title: "Generate this video?",
      description: "This action consumes paid provider credits.",
    });

    await clickButton();

    expect(mockConfirm).toHaveBeenCalledWith({
      title: "Generate this video?",
      description: "This action consumes paid provider credits.",
      confirmLabel: "Generate video",
    });
    expect(mockRunAction).not.toHaveBeenCalled();
  });

  it("launches with the declared values after confirmation", async () => {
    mockConfirm.mockResolvedValue(true);
    await renderButton({
      title: "Generate this video?",
      description: "This action consumes paid provider credits.",
      confirmLabel: "Continue",
    });

    await clickButton();

    expect(mockRunAction).toHaveBeenCalledWith("trigger_agent", {
      agentId: "agent-1",
      variables: { video_description: "A calm ocean" },
      llmOverrides: { aspect_ratio: "16:9", duration_seconds: 8 },
    });
  });

  it("preserves the existing one-click path when no gate is declared", async () => {
    await renderButton();

    await clickButton();

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunAction).toHaveBeenCalledTimes(1);
  });
});
