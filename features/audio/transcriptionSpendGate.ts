/**
 * features/audio/transcriptionSpendGate.ts — THE one gate between "the person
 * picked an audio file" and "we spend money transcribing it".
 *
 * THE EXPENSIVE-CLICK LAW (`common-docs/policies/destructive-and-expensive-actions.md`,
 * and the repo's UI standards): a click that spends states its consequence
 * FIRST. A nine-hour audiobook that begins transcribing the instant it finishes
 * uploading is a silent spend, and "Are you sure?" would not fix it — the
 * person has to see the three facts that make the decision: how long the audio
 * is, what it is expected to cost, and how long they will be waiting.
 *
 * Both rates and the length above which this fires are knobs
 * (`features/audio/limits.ts`, feature `media.transcription`). There is no
 * server-side transcription cost endpoint — `/audio/transcribe*` quotes
 * nothing — so the figure is computed from duration × the knob rate and is
 * labelled an ESTIMATE everywhere it appears, never a charge.
 */

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import {
  estimateTranscription,
  transcriptionNeedsConfirmation,
  type TranscriptionEstimate,
} from "./limits";

/**
 * The audio's length in seconds, read from the browser's own decoder.
 *
 * Returns `null` when the browser cannot report it (a container it will not
 * decode, a stream with no duration metadata). A null duration is never
 * treated as "short": the gate below confirms anyway and says the length is
 * unknown, because guessing downward is how a long file gets transcribed
 * without anyone approving it.
 */
export async function probeAudioDurationSeconds(
  source: Blob,
): Promise<number | null> {
  if (typeof window === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const url = URL.createObjectURL(source);
  try {
    return await new Promise<number | null>((resolve) => {
      const element = document.createElement("audio");
      element.preload = "metadata";
      const done = (value: number | null) => {
        element.onloadedmetadata = null;
        element.onerror = null;
        element.src = "";
        resolve(value);
      };
      element.onloadedmetadata = () => {
        const seconds = element.duration;
        done(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
      };
      element.onerror = () => done(null);
      element.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SpendGateOutcome {
  /** True when transcription may proceed. */
  proceed: boolean;
  /** The estimate that was shown, when one was. */
  estimate: TranscriptionEstimate | null;
}

function describe(
  estimate: TranscriptionEstimate | null,
  filename: string | undefined,
): string {
  const what = filename ? `"${filename}"` : "This audio";
  if (!estimate) {
    return (
      `${what} could not be measured in this browser, so its length, cost and ` +
      `processing time cannot be estimated before it runs. Transcription bills ` +
      `by the hour of audio, so a long file can cost meaningfully more than a ` +
      `short one. Start it anyway?`
    );
  }
  const lines = [
    `Length: ${estimate.durationLabel}`,
    `Estimated cost: ${estimate.costLabel}`,
    `Estimated time: ${estimate.processingLabel}`,
  ];
  const tail = estimate.rated
    ? "These are estimates based on your organization's configured transcription rates, not a final charge."
    : "Part of this could not be estimated because a transcription rate setting could not be read — an administrator sets these under Users & Access → Limits & Knobs.";
  return `${what} will be transcribed now.\n\n${lines.join("\n")}\n\n${tail}`;
}

/**
 * Show the estimate and get an answer, when the audio is long enough to be
 * worth asking about.
 *
 * `durationSeconds` may be `null` when it could not be measured — the gate then
 * always asks, and says plainly that it could not measure the file.
 */
export async function confirmTranscriptionSpend(options: {
  durationSeconds: number | null;
  filename?: string;
}): Promise<SpendGateOutcome> {
  const { durationSeconds, filename } = options;

  if (durationSeconds === null) {
    const proceed = await confirm({
      title: "Transcribe this audio?",
      description: describe(null, filename),
      confirmLabel: "Transcribe",
    });
    return { proceed, estimate: null };
  }

  if (!(await transcriptionNeedsConfirmation(durationSeconds))) {
    return { proceed: true, estimate: null };
  }

  const estimate = await estimateTranscription(durationSeconds);
  const proceed = await confirm({
    title: "Transcribe this audio?",
    description: describe(estimate, filename),
    confirmLabel: "Transcribe",
  });
  return { proceed, estimate };
}

/**
 * The whole gate for a blob we already hold: measure it, then ask if it is
 * long enough to be worth asking about. Returns `false` when the person
 * declined — callers stop, silently and without an error toast.
 */
export async function gateTranscriptionOfBlob(
  blob: Blob,
  filename?: string,
): Promise<boolean> {
  const durationSeconds = await probeAudioDurationSeconds(blob);
  const { proceed } = await confirmTranscriptionSpend({
    durationSeconds,
    filename,
  });
  return proceed;
}
