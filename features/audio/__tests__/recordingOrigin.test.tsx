/**
 * THE RECORDING ORIGIN — does the stamp actually survive the shared chain?
 *
 * These tests exist because the microphone is the one thing a headless browser
 * cannot give you, so the write path can never be driven from a real recording
 * in CI or in an agent's browser pane. They therefore force the two things that
 * would silently break the feature:
 *
 *   1. The origin a SURFACE declares reaches `provider.start()` — the exact
 *      handoff into the one shared recording engine. Nothing is mocked between
 *      the provider and the assertion except the engine itself.
 *   2. The row the recorder auto-persists carries the origin — title,
 *      description, and `metadata.origin` — and a surface that declares NO
 *      origin still writes exactly the row it always wrote.
 *
 * A regression in either is invisible in every other test: recording keeps
 * working, the audio still uploads, and the Expert's words silently become
 * unfindable again.
 */

// React 19 refuses to treat `act()` as an act-scope without this flag, and
// warns on every render otherwise. Set before React DOM is imported.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import recordingsReducer from "@/lib/redux/slices/recordingsSlice";
import {
  RecordingOriginProvider,
} from "@/features/audio/RecordingOriginProvider";
import { useVoiceCapture } from "@/features/audio/hooks/useVoiceCapture";
import {
  buildDictationDraft,
  parseRecordingOrigin,
  recordingTitleFor,
  type RecordingOrigin,
} from "@/features/audio/recordingOrigin";
import type { StartRecordingArgs } from "@/features/audio/recordingTypes";

// The single shared recording engine. `useVoiceCapture` reaches it through this
// hook; capturing its `start` argument is capturing exactly what the engine —
// and therefore the recorder, and therefore the transcript row — receives.
const started: StartRecordingArgs[] = [];
jest.mock("@/providers/GlobalRecordingProvider", () => ({
  useGlobalRecordingOptional: () => ({
    isFinalizing: false,
    start: async (args: unknown) => {
      started.push(args as StartRecordingArgs);
    },
    stop: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
  }),
}));

const ORIGIN: RecordingOrigin = {
  surface: "masterwork.interview",
  conversationId: "4706f9c0-4050-4993-9cf8-b472079aab3a",
  entityToken: "rulebook",
  entityId: "8d1d4f08-c4c0-4e1d-ba9a-51d5d7bf69fb",
  label: "SEO Keyword Optimization",
  href: "/masterwork/8d1d4f08-c4c0-4e1d-ba9a-51d5d7bf69fb",
};

/**
 * Mount a REAL mic consumer inside a surface that declares `origin`, then press
 * its start. No hook is stubbed between the provider and the engine mock — this
 * is the production `useVoiceCapture`, mounted the way a ProTextarea mounts it.
 */
async function startRecordingInside(
  origin: RecordingOrigin | null,
  options: Parameters<typeof useVoiceCapture>[0],
): Promise<void> {
  const store = configureStore({ reducer: { recordings: recordingsReducer } });
  // A holder rather than a plain `let`: TypeScript cannot see the assignment
  // that React makes inside the component, and narrows a `let` to `null`.
  const handle: { start: (() => Promise<void>) | null } = { start: null };

  function MicConsumer() {
    handle.start = useVoiceCapture(options).start;
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <RecordingOriginProvider origin={origin}>
          <MicConsumer />
        </RecordingOriginProvider>
      </Provider>,
    );
  });

  const press = handle.start;
  if (!press) throw new Error("the mic consumer never mounted");
  await act(async () => {
    await press();
  });

  await act(async () => {
    root.unmount();
  });
  container.remove();
}

beforeEach(() => {
  started.length = 0;
});

describe("the origin a surface declares reaches the shared recorder", () => {
  it("stamps a recording started inside a declaring surface", async () => {
    await startRecordingInside(ORIGIN, {
      instanceId: "composer",
      label: "Voice input",
    });

    expect(started).toHaveLength(1);
    expect(started[0].context).toMatchObject({
      kind: "field",
      instanceId: "composer",
      origin: ORIGIN,
    });
  });

  it("leaves every surface that declares none exactly as it was", async () => {
    await startRecordingInside(null, {
      instanceId: "composer",
      label: "Voice input",
    });

    expect(started).toHaveLength(1);
    expect(started[0].context).toEqual({
      kind: "field",
      instanceId: "composer",
      label: "Voice input",
    });
    expect("origin" in started[0].context).toBe(false);
  });

  it("lets an explicit option override the surrounding surface", async () => {
    const mine: RecordingOrigin = { surface: "notes.editor", label: "A note" };
    await startRecordingInside(ORIGIN, { instanceId: "composer", origin: mine });

    expect(started[0].context.origin).toEqual(mine);
  });
});

describe("the row the recorder writes", () => {
  const now = new Date("2026-08-17T16:00:00Z");

  it("carries the origin, an honest name, and a plain description", () => {
    const draft = buildDictationDraft({
      text: "Okay, so the way my keyword research works is…",
      durationSec: 350,
      origin: ORIGIN,
      now,
    });

    expect(draft.metadata).toEqual({ origin: ORIGIN });
    expect(draft.title).toBe(recordingTitleFor(ORIGIN, now));
    expect(draft.title).toContain("SEO Keyword Optimization");
    expect(draft.title).not.toBe("Voice Pad Recording");
    expect(draft.description).toBe("Dictated into SEO Keyword Optimization.");
    // The upload id is added by the caller once the upload lands — the builder
    // never invents one, so the words survive an upload failure.
    expect("audio_file_path" in draft).toBe(false);
    expect(draft.segments[0]).toMatchObject({ seconds: 350 });
  });

  it("writes the pre-existing row untouched when there is no origin", () => {
    const draft = buildDictationDraft({
      text: "hello",
      durationSec: 5,
      origin: null,
      now,
    });

    expect(draft.title).toBe("Voice Pad Recording");
    expect(draft.description).toBe("");
    expect(draft.folder_name).toBe("Recordings");
    expect(draft.source_type).toBe("audio");
    expect("metadata" in draft).toBe(false);
  });
});

describe("reading an origin back off a row", () => {
  it("round-trips what the recorder wrote", () => {
    const draft = buildDictationDraft({
      text: "x",
      durationSec: 1,
      origin: ORIGIN,
    });
    expect(parseRecordingOrigin(draft.metadata?.origin)).toEqual(ORIGIN);
  });

  it("refuses anything that isn't an origin", () => {
    // Every row written before 2026-08-17, plus any junk in the jsonb bag.
    expect(parseRecordingOrigin(undefined)).toBeNull();
    expect(parseRecordingOrigin(null)).toBeNull();
    expect(parseRecordingOrigin({ duration: 810 })).toBeNull();
    expect(parseRecordingOrigin({ surface: "" })).toBeNull();
  });
});
