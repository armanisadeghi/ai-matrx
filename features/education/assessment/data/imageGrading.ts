// features/education/assessment/data/imageGrading.ts
//
// The REUSABLE handwritten / image-answer grading core — the one path every
// "photograph your worked answer" surface runs through: assessment written-item
// photo answers today, and the standalone "Grade my handwritten work" surface.
// Deliberately decoupled from any Redux UI slice: it takes an image + problem +
// rubric, drives the VISION grader agent, and RETURNS a structured STEP-LEVEL
// grade (StepGradeVerdict). Callers own their own UI state + persistence.
//
// This is the image twin of the spoken crown jewel
// (features/flashcards/fast-fire/agents/grading-core.ts): upload the media →
// durable file_id, then run the canonical headless primitive
// (`runHeadlessAgentJson`, D126) with the photo attached as a message part. Never grade an image without an
// uploaded file_id. The grader is authored + tuned in-system (agent id in
// data/agents.ts); the tolerant coercer absorbs prompt-driven key drift.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fileHandler } from "@/features/files/handler/handler";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import {
  coerceStepGradeVerdict,
  type StepGradeVerdict,
} from "@/features/education/trust/types";

export interface UploadWorkPhotoOpts {
  metadata?: Record<string, unknown>;
}

/**
 * Upload a photo of a learner's worked answer → durable file_id (or null on
 * missing/failed). Best-effort; never throws — a failed upload means the caller
 * skips grading and tells the learner to retry. Goes through the ONE file entry
 * point (fileHandler); the bytes land in the hidden `system-files/image-grade`
 * class so they never clutter the Files browser.
 */
export async function uploadWorkPhoto(
  file: File | Blob,
  opts: UploadWorkPhotoOpts = {},
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  try {
    const source =
      file instanceof File
        ? ({ kind: "file", file } as const)
        : ({
            kind: "blob",
            blob: file,
            fileName: "handwritten-work.png",
            mime: file.type || "image/png",
          } as const);
    const uploaded = await fileHandler.upload(source, {
      folderPath: CloudFolders.SYSTEM_IMAGE_GRADE_RESPONSES,
      visibility: "personal",
      metadata: opts.metadata ?? {},
    });
    return uploaded.fileId ?? null;
  } catch (err) {
    console.error("[imageGrading] work-photo upload failed:", err);
    return null;
  }
}

export interface RunVisionGraderArgs {
  agentId: string;
  /** The problem statement / question the learner was solving. */
  question: string;
  /** The model answer OR rubric describing full credit — graded on meaning. */
  expected: string;
  /** A durable file_id for the uploaded photo (REQUIRED — never grade w/o an image). */
  responseImageFileId: string;
  surfaceKey: string;
  sourceFeature: SourceFeature;
}

/**
 * Drive the vision grader agent for ONE photographed answer and return the
 * structured step-level grade via the headless primitive (photo attached as a
 * message part). Returns null on any failure. Never records anything or touches a slice — the caller owns
 * persistence + UI.
 */
export function runVisionGrader(args: RunVisionGraderArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<StepGradeVerdict | null> => {
    try {
      const part = await fileHandler.toContentPart({
        kind: "file_id",
        fileId: args.responseImageFileId,
      });
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId: args.agentId,
        surfaceKey: args.surfaceKey,
        // Persisted (not ephemeral — that path 404s the v2 gate) but kept out
        // of the user's normal chats via the system-marked source_feature.
        sourceFeature: args.sourceFeature,
        variables: {
          question: args.question,
          expected_answer: args.expected,
        },
        // Two-step attach path: the photo rides as a message part.
        messageParts: [part],
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });
      return coerceStepGradeVerdict(result.data);
    } catch (err) {
      console.error(`[imageGrading] runVisionGrader (${args.surfaceKey}):`, err);
      return null;
    }
  };
}
