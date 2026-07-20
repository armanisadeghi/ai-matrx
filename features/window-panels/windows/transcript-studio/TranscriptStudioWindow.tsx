"use client";

/**
 * TranscriptStudioWindow — floating-window mount of the transcript studio.
 *
 * Wraps the SAME `<StudioView>` that the route at `/transcription/studio` uses.
 * The route renders with `containerVariant: "page"` (full-page layout); the
 * window renders with `containerVariant: "window"` so the studio's own
 * components can adjust spacing if needed.
 *
 * Recording survives the window being closed: the recorder lives in
 * `<GlobalRecordingProvider>` mounted at the app shell. Closing the window
 * does NOT stop a recording; only the explicit Stop button does.
 *
 * Persistence: the `activeSessionId` is the only window-specific datum we
 * remember. Geometry + open/close + z-index are handled by the window-panels
 * subsystem via the registry's `defaultData` + Redux `windowManagerSlice`.
 */

import { useCallback } from "react";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { StudioView } from "@/features/transcript-studio/components/StudioView";
import { selectActiveSessionId } from "@/features/transcript-studio/redux/selectors";

const OVERLAY_ID = "transcriptStudioWindow";
const WINDOW_ID = "transcript-studio-window";

export interface TranscriptStudioWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title"
> {
  title?: string;
  /** Restored from the local window workspace cache on mount. */
  activeSessionId?: string | null;
}

export function TranscriptStudioWindow({
  title = "Transcript Studio",
  id = WINDOW_ID,
  activeSessionId: initialActiveSessionId,
  ...windowProps
}: TranscriptStudioWindowProps) {
  const activeSessionId = useAppSelector(selectActiveSessionId);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      activeSessionId: activeSessionId ?? null,
    }),
    [activeSessionId],
  );

  return (
    <WindowPanel
      title={title}
      minWidth={760}
      minHeight={440}
      id={id}
      overlayId={OVERLAY_ID}
      onCollectData={collectData}
      {...windowProps}
    >
      <StudioView
        config={{
          containerVariant: "window",
          showSidebar: true,
          showSettings: true,
          initialSessionId: initialActiveSessionId ?? null,
        }}
      />
    </WindowPanel>
  );
}
