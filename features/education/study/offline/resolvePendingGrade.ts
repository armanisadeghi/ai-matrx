/**
 * features/education/study/offline/resolvePendingGrade.ts
 *
 * The grading half of the flush — the injected `PendingGradeResolver` that
 * `replay.ts` deliberately does not import.
 *
 * WHY IT IS A SEPARATE FILE. `replay.ts` is a pure service module: no Redux, no
 * file handling, loadable anywhere. Grading a held answer needs both
 * (`fileHandler.upload` for the clip, a headless agent run for the grade, and
 * `dispatch`/`getState` for the run). Rather than dragging the client runtime
 * into the replay loop, the loop declares a function TYPE and the one caller
 * that already holds a store — `useOfflineStudySync` — builds it here and hands
 * it in. That is the whole architectural expansion: one function type and one
 * factory. No registry, no singleton, no service layer.
 *
 * REUSE, NOT A SECOND PATH. Both steps are the SAME primitives the online drill
 * runs: `uploadResponseClip` and `runSpokenGrader` from the spoken grading core.
 * A held answer is graded by exactly the code that would have graded it live —
 * the only difference is when. Every hardening the core has (the no-audio
 * guard, the durable upload, the tolerant coercion) comes with it for free, and
 * a fork here would be a second grading contract to keep in step forever.
 *
 * IT NEVER FABRICATES. A failure at either step returns null; the replay loop
 * then retries and, at its cap, records the attempt exactly as captured —
 * `result: null`. There is no path through this file that invents a grade.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { verdictResult } from "@/features/education/trust/types";
import {
  runSpokenGrader,
  uploadResponseClip,
} from "@/features/flashcards/fast-fire/agents/grading-core";
import type { PendingGradeResolver } from "./replay";

/**
 * Build the resolver for one Redux store.
 *
 * `getState` rather than a captured snapshot: a flush can run minutes after the
 * hook mounted, and the agent run must resolve its mandate against the store as
 * it is NOW — a binding the learner changed in between is the binding that
 * should apply.
 */
export function createPendingGradeResolver(
  dispatch: AppDispatch,
  getState: () => RootState,
): PendingGradeResolver {
  return async ({ spec, data, mimeType }) => {
    // The recording is held as raw bytes (see `OutboxClip`), so the Blob is
    // rebuilt here with its real audio type — a Blob with an empty `type` gets
    // stored under the wrong container and plays back as nothing.
    const clip = new Blob([data], { type: mimeType || "audio/wav" });

    const responseAudioFileId = await uploadResponseClip(clip, {
      folderPath: spec.folderPath || CloudFolders.SYSTEM_FASTFIRE_RESPONSES,
      metadata: {
        ...spec.uploadMetadata,
        // Provenance the online path cannot carry: this recording sat on the
        // learner's device before it reached us, so anything reading the file
        // row can tell a replayed clip from a live one.
        captured_offline: true,
      },
      ...(spec.cardId ? { cardId: spec.cardId } : {}),
    });
    // Still no network (or the upload was refused). Transient from here — the
    // loop keeps the clip and tries again.
    if (!responseAudioFileId) return null;

    const grade = await dispatch(
      runSpokenGrader({
        mandateKey: spec.mandateKey,
        front: spec.front,
        back: spec.back,
        secondsAllowed: spec.secondsAllowed,
        responseAudioFileId,
        ...(spec.rubric ? { rubric: spec.rubric } : {}),
        surfaceKey: `${spec.surface}-grade-replay`,
        sourceFeature: spec.sourceFeature,
        ...(spec.surfaceName ? { surfaceName: spec.surfaceName } : {}),
      }),
    );

    if (!grade) {
      // THE UPLOAD SURVIVED, THE GRADE DID NOT — and that asymmetry is the
      // point of this branch. Returning null here would send the loop back
      // round to re-upload the same clip next flush, so we return the attempt
      // WITH its audio pointer and no grade. The learner's answer content is
      // now safely on the server, permanently, which is the loss this whole
      // build exists to stop; the missing grade is the smaller, recoverable
      // half (an ungraded attempt with audio can be graded later by any
      // surface that can see it — an attempt with no audio never can).
      return {
        responseAudioFileId,
        result: null,
        scoreValue: null,
        score: { grade_error: "offline replay: the grader did not return a grade" },
        responseTranscript: null,
        gradedBy: spec.mandateKey,
      };
    }

    return {
      responseAudioFileId,
      result: verdictResult(grade.verdict),
      scoreValue: grade.score,
      score: {
        rubric: grade.rubric,
        missing: grade.missing,
        feedback: grade.verdict.explanation,
        // Same marker as the file row, on the ledger side: this grade was
        // produced at reconnect, not while the learner was answering.
        graded_offline_replay: true,
      },
      responseTranscript: grade.transcript || null,
      gradedBy: spec.mandateKey,
    };
  };
}
