"use client";

/**
 * adoptCloudBrowserRunFromStream — the go-live seam the feature has been
 * missing: the chat stream's `human_required` tool result hydrates
 * `cloudBrowserSlice`, so `CloudBrowserHandoffCanvasOpener` can open the canvas
 * BEFORE the panel has ever been opened.
 *
 * Without this the watcher only ever saw a handoff that a mounted
 * `useCloudBrowser` had already loaded — i.e. the person had to go find the
 * browser themselves, which is the exact wait the agent-initiated open exists
 * to remove. A run that stops for a person and tells nobody is the same defect
 * as a spinner.
 *
 * It hydrates through the ONE canonical snapshot path rather than fabricating a
 * handoff row out of the tool payload: the server wrote the real row durably
 * before it answered, so the surface reads it instead of guessing at ids,
 * profile, controller or expiry. `loadSnapshotForRun` refuses to start a
 * browser, so a stream event can never conjure one.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import * as service from "../service";
import { hydrateSnapshot } from "./cloudBrowserSlice";
import type { BrowserHandoffSignal } from "./streamHandoffSignal";

export const adoptCloudBrowserRunFromStream = createAsyncThunk<
  void,
  BrowserHandoffSignal,
  { state: RootState; dispatch: AppDispatch }
>(
  "cloudBrowser/adoptRunFromStream",
  async (signal, { dispatch, getState }) => {
    const current = getState().cloudBrowser;
    // Already showing this exact episode — a re-emitted completion must not
    // re-load the panel underneath someone who is mid-takeover.
    if (
      current.run?.id === signal.runId &&
      current.handoff?.state === "requested"
    ) {
      return;
    }
    try {
      const snapshot = await service.loadSnapshotForRun(signal);
      if (snapshot) dispatch(hydrateSnapshot(snapshot));
    } catch (error) {
      // Never break the chat stream over the browser panel. Scream, don't throw.
      console.error(
        "[cloud-browser] could not adopt the run named by a human_required tool result",
        { signal, error },
      );
    }
  },
);
