import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import MicrophoneIconButtonCore from "./MicrophoneIconButtonCore";
import { useVoiceCapture } from "@/features/audio/hooks/useVoiceCapture";

jest.mock("@/features/audio/hooks/useVoiceCapture", () => ({
  useVoiceCapture: jest.fn(),
}));
jest.mock("./RecordingIndicator", () => ({
  RecordingIndicator: ({ size }: { size: string }) => (
    <div data-testid="recording" data-size={size} />
  ),
}));
jest.mock("./TranscriptionLoader", () => ({
  TranscriptionLoader: ({ size }: { size: string }) => (
    <div data-testid="transcribing" data-size={size} />
  ),
}));
jest.mock("./VoiceTroubleshootingModal", () => ({
  VoiceTroubleshootingModal: () => null,
}));
jest.mock("./MicrophoneRecordingModal", () => ({
  MicrophoneRecordingModal: () => null,
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

const mockedUseVoiceCapture = jest.mocked(useVoiceCapture);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function captureState(state: "recording" | "transcribing") {
  return {
    isRecording: state === "recording",
    isAnyRecording: state === "recording",
    isOwner: true,
    isTranscribing: state === "transcribing",
    isFinalizing: state === "transcribing",
    isPaused: false,
    durationSec: 3,
    audioLevel: 20,
    liveTranscript: "",
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    cancel: jest.fn(),
    toggle: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    available: true,
  };
}

describe("P10 microphone status size contract", () => {
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
    jest.clearAllMocks();
  });

  it.each([
    ["xs", "sm"],
    ["sm", "sm"],
    ["md", "md"],
    ["lg", "lg"],
  ] as const)("maps %s to %s in recording and transcribing states", (size, expected) => {
    mockedUseVoiceCapture.mockReturnValue(captureState("recording"));
    act(() => {
      root.render(
        <MicrophoneIconButtonCore
          variant="inline-expand"
          size={size}
          onTranscriptionComplete={jest.fn()}
        />,
      );
    });
    expect(
      host.querySelector('[data-testid="recording"]')?.getAttribute("data-size"),
    ).toBe(expected);

    mockedUseVoiceCapture.mockReturnValue(captureState("transcribing"));
    act(() => {
      root.render(
        <MicrophoneIconButtonCore
          variant="inline-expand"
          size={size}
          onTranscriptionComplete={jest.fn()}
        />,
      );
    });
    expect(
      host.querySelector('[data-testid="transcribing"]')?.getAttribute("data-size"),
    ).toBe(expected);
  });
});
