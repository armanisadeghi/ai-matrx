/**
 * THE VOICE-FIRST DOOR — "just talk and we'll do the rest", end to end.
 *
 * Arman's expertise mandate puts voice capture first. The server lane has
 * existed since the recording lane shipped (transcribe → chunk by transcript
 * time range → `masterwork.monologue_distiller` → rules anchored to the moment
 * they were said), and the `monologue` Approach sat `enabled = false` for one
 * reason: the product had no capture surface, so an Expert who wanted to TALK
 * was sent to the generic "Upload a file" card — told to go and make a
 * recording somewhere else first.
 *
 * This suite drives the REAL `IngestSourceDialog` on the REAL monologue lane,
 * with the REAL `MonologueRecorder` over a stubbed `useSimpleRecorder` (the
 * browser has no microphone in jsdom; the hook is the platform's one capture
 * primitive and is not this door's code). Only the recorder, the durable run,
 * and the uploader are stubbed.
 *
 * Proven red before green (2026-09-12), each independently:
 *
 * * remove `"monologue"` from `INGEST_LANES` → the lane never reaches the
 *   dialog and every test here fails.
 * * render the paste textarea for `monologue` → "shows no paste box" fails.
 * * post to `/masterworks/ingest` instead of `/masterworks/ingest-file` →
 *   "launches the recording down the file lane" fails.
 * * drop the `describeDistillWait` line → "promises a measured wait" fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { UseFileUploadResult } from "@/features/files/handler/hooks/useFileUpload";

import { IngestSourceDialog } from "../IngestSourceDialog";
import { INGEST_LANES } from "../../../browse/approachLane";
import type { Rulebook } from "../../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The stubbed capture primitive, driven by the test. */
const recorder = {
  isRecording: false,
  isPaused: false,
  duration: 0,
  audioBlob: null as Blob | null,
  audioLevel: 0,
  onComplete: null as ((blob: Blob) => void) | null,
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  pauseRecording: jest.fn(),
  resumeRecording: jest.fn(),
  reset: jest.fn(),
};

jest.mock("@/features/audio/hooks/useSimpleRecorder", () => ({
  useSimpleRecorder: (opts: { onRecordingComplete?: (b: Blob) => void }) => {
    recorder.onComplete = opts.onRecordingComplete ?? null;
    return recorder;
  },
}));

const launch = jest.fn();
const usePath = { value: "" };
jest.mock("../../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: (opts: { path: string }) => {
    usePath.value = opts.path;
    return {
      running: false,
      stages: [],
      result: null,
      status: "idle",
      error: null,
      launch,
      reset: jest.fn(),
      fail: jest.fn(),
      retry: jest.fn(),
      waitMessage: null,
    };
  },
}));

const upload = jest.fn(
  async (..._args: Parameters<UseFileUploadResult["upload"]>) => ({
    fileId: "file-abc",
  }),
);
jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload }),
}));

jest.mock("../../../record/pastedSource", () => ({
  recordPastedSource: jest.fn(),
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const RULEBOOK = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "How I edit",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
} as unknown as Rulebook;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <IngestSourceDialog
          open
          onOpenChange={() => {}}
          rulebook={RULEBOOK}
          initialLane="monologue"
        />
      </TooltipProvider>,
    );
  });
}

function text(): string {
  return document.body.textContent ?? "";
}

function buttonByText(needle: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find((el) =>
    el.textContent?.trim().includes(needle),
  );
  if (!button) throw new Error(`no button containing "${needle}"`);
  return button as HTMLButtonElement;
}

/** Deliver a finished recording the way the real hook does. */
async function finishRecording(seconds: number) {
  recorder.isRecording = true;
  recorder.duration = seconds;
  await act(async () => {
    root.render(
      <TooltipProvider>
        <IngestSourceDialog
          open
          onOpenChange={() => {}}
          rulebook={RULEBOOK}
          initialLane="monologue"
        />
      </TooltipProvider>,
    );
  });
  await act(async () => {
    recorder.onComplete?.(new Blob(["fake audio"], { type: "audio/webm" }));
  });
}

beforeEach(() => {
  recorder.isRecording = false;
  recorder.isPaused = false;
  recorder.duration = 0;
  recorder.audioBlob = null;
  recorder.audioLevel = 0;
  launch.mockClear();
  upload.mockClear();
});

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

describe("the monologue Approach's door", () => {
  it("is a registered ingest lane", async () => {
    await mount();
    expect([...INGEST_LANES]).toContain("monologue");
  });

  it("opens on a microphone, and shows no paste box or source-shape question", async () => {
    await mount();
    expect(text()).toContain("Start talking");
    expect(text()).toContain("Just talk");
    // A person who came here to TALK is not asked to choose a source shape.
    expect(text()).not.toContain("How do you want to bring it in?");
    expect(text()).not.toContain("What kind of source is it?");
    expect(document.querySelector("#ingest-text")).toBeNull();
    // And there is still a way in for a recording they already have.
    expect(text()).toContain("Or upload a recording you already have");
  });

  it("cannot be submitted until something has actually been said", async () => {
    await mount();
    expect(buttonByText("Distill what I said").disabled).toBe(true);
  });

  it("promises a measured wait once the recording exists — never a bare spinner", async () => {
    await mount();
    await finishRecording(3600);
    // An hour of talking → the honest over-estimate, stated as a range.
    expect(text()).toMatch(/usually takes about \d+–\d+ minutes/);
    expect(buttonByText("Distill what I said").disabled).toBe(false);
  });

  it("launches the recording down the file lane, as a real named file", async () => {
    await mount();
    await finishRecording(95);

    await act(async () => {
      buttonByText("Distill what I said").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // A recording IS a file to the server, which routes audio to the monologue
    // distiller by content type — one pipeline, not a second one.
    expect(usePath.value).toBe("/masterworks/ingest-file");
    expect(upload).toHaveBeenCalledTimes(1);
    const [source, options] = upload.mock.calls[0]!;
    expect(source.kind).toBe("file");
    if (source.kind !== "file") {
      throw new Error("The monologue recording must use the file upload source");
    }
    if (!options) {
      throw new Error("The monologue recording must include upload options");
    }
    if (!options.metadata) {
      throw new Error("The monologue recording must include source metadata");
    }
    expect(source.file.type).toBe("audio/webm");
    expect(source.file.name).toContain("Talking it through");
    // CUSTODY: the recording is filed against the Rulebook it was said about,
    // not into a nameless general folder.
    expect(options.folderPath).toBe("Masterwork/Sources");
    expect(options.metadata.rulebook_id).toBe(RULEBOOK.id);

    expect(launch).toHaveBeenCalledTimes(1);
    const [body] = launch.mock.calls[0] as [Record<string, unknown>];
    expect(body.rulebook_id).toBe(RULEBOOK.id);
    expect(body.file_id).toBe("file-abc");
  });
});
