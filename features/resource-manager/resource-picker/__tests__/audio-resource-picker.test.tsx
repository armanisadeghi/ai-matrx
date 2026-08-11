import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Resource } from "@/features/agents/resources/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const TRANSCRIPT = "This transcript is message text, not an audio attachment.";

jest.mock("@/components/official-candidate/voice-pad/components/VoicePadEmbed", () => ({
  VoicePadEmbed: ({
    onAttachTranscript,
  }: {
    onAttachTranscript: (transcript: string) => void;
  }) => (
    <button type="button" onClick={() => onAttachTranscript(TRANSCRIPT)}>
      Attach transcript
    </button>
  ),
}));

jest.mock("../ResourcePickerSubViewHeader", () => ({
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS: "test-height",
  ResourcePickerSubViewHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import { AudioResourcePicker } from "../AudioResourcePicker";

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
  jest.restoreAllMocks();
});

it("emits the Voice Pad transcript as a canonical text resource", () => {
  const onSelect = jest.fn<void, [Resource]>();
  jest.spyOn(Date, "now").mockReturnValue(172341);

  act(() => {
    root.render(
      <AudioResourcePicker
        conversationId="conversation-1"
        onBack={jest.fn()}
        onSelect={onSelect}
      />,
    );
  });

  const attach = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Attach transcript",
  );
  expect(attach).toBeDefined();
  act(() => attach?.click());

  expect(onSelect).toHaveBeenCalledWith({
    type: "text",
    data: {
      id: "voice-pad-172341",
      label: "Voice Pad transcript",
      text: TRANSCRIPT,
    },
  });
});
