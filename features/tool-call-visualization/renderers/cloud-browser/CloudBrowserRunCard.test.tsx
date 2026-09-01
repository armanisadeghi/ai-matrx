import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: () => <div data-testid="inline-media" />,
}));

jest.mock("@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas", () => ({
  useOpenCloudBrowserCanvas: () => jest.fn(),
}));

import { CloudBrowserRunCard } from "./CloudBrowserRunCard";

const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";

function screenshotEntry(): ToolLifecycleEntry {
  return {
    callId: "cloud-browser-screenshot",
    toolName: "cloud_browser",
    displayName: "Cloud Browser",
    status: "completed",
    arguments: { action: "screenshot", session_id: "run-1" },
    result: {
      kind: "image_ref",
      media_ref: { file_id: FILE_ID, mime_type: "image/png" },
      session_id: "run-1",
    },
    resultPreview: null,
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:01.000Z",
    latestMessage: null,
    latestData: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

describe("CloudBrowserRunCard screenshot output", () => {
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

  test("renders owned screenshot media with the canonical Files viewer door", () => {
    act(() => {
      root.render(<CloudBrowserRunCard entries={[screenshotEntry()]} expanded />);
    });

    expect(container.querySelector('[data-testid="inline-media"]')).not.toBeNull();
    const open = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="View in Files"]',
    );
    expect(open?.getAttribute("href")).toBe(`/files/f/${FILE_ID}`);
    expect(open?.getAttribute("target")).toBe("_blank");
  });
});
