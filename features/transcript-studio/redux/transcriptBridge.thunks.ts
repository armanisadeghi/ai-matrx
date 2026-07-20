/**
 * Thunks wrapping the transcript-bridge service. Both directions trigger a
 * refetch of the affected session's data so Redux reflects the new state
 * (sessions list, raw segments, transcript_id link).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import type { Transcript } from "@/features/transcripts/types";
import {
  promoteTranscriptToStudio,
  saveStudioAsTranscript,
  type PromoteToStudioResult,
  type SaveAsTranscriptResult,
} from "../service/transcriptBridge";
import { getSession } from "../service/studioService";
import {
  fetchRawSegmentsThunk,
  fetchSessionsThunk,
} from "./thunks";
import { sessionUpserted } from "./slice";

interface PromoteThunkArgs {
  transcript: Transcript;
  userId: string;
  /** When true, sets the new session active so the studio jumps to it. */
  activate?: boolean;
}

export const promoteTranscriptThunk = createAsyncThunk<
  PromoteToStudioResult,
  PromoteThunkArgs
>(
  "transcriptStudio/promoteTranscript",
  async (args, { dispatch, rejectWithValue }) => {
    try {
      const result = await promoteTranscriptToStudio({
        transcript: args.transcript,
        userId: args.userId,
      });

      // Refresh sessions list + the specific session's raw segments so the
      // studio paints the new content immediately.
      await Promise.allSettled([
        dispatch(fetchSessionsThunk()).unwrap(),
        dispatch(
          fetchRawSegmentsThunk({ sessionId: result.sessionId }),
        ).unwrap(),
      ]);

      toast.success(
        result.alreadyPromoted
          ? "Already promoted — opening the existing studio session."
          : `Promoted ${result.rawSegmentCount} segment${result.rawSegmentCount === 1 ? "" : "s"} to the studio.`,
      );
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to promote transcript";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

interface SaveAsTranscriptArgs {
  sessionId: string;
  title?: string;
  folderName?: string;
}

export const saveAsTranscriptThunk = createAsyncThunk<
  SaveAsTranscriptResult,
  SaveAsTranscriptArgs
>(
  "transcriptStudio/saveAsTranscript",
  async (args, { dispatch, rejectWithValue }) => {
    try {
      const session = await getSession(args.sessionId);
      if (!session) {
        const error = "Session not found.";
        toast.error(error);
        return rejectWithValue(error);
      }
      const result = await saveStudioAsTranscript({
        session,
        title: args.title,
        folderName: args.folderName,
      });

      // Refresh the session row so the local copy has the new transcript_id.
      const updated = await getSession(args.sessionId);
      if (updated) dispatch(sessionUpserted(updated));

      toast.success(
        result.updatedExisting
          ? `Updated linked transcript with ${result.segmentCount} segment${result.segmentCount === 1 ? "" : "s"}.`
          : `Saved as new transcript (${result.segmentCount} segment${result.segmentCount === 1 ? "" : "s"}).`,
      );
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save as transcript";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);
