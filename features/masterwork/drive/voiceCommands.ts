// features/masterwork/drive/voiceCommands.ts
//
// HANDS ON THE WHEEL. The drive lane has exactly one thing you touch — the
// start control — and after that every control is a sentence.
//
// This is a deterministic matcher over the transcript the realtime session
// already produces, NOT an instruction to the interviewer. That matters for
// three reasons:
//   1. It works whatever agent is bound. The Expert's "stop recording" must
//      never depend on a model deciding to call a tool.
//   2. It is testable without a network, a model, or a microphone.
//   3. Agent instructions are the owner's to write; a keyword table is code.
//
// A command must be UNAMBIGUOUS, because a false positive cuts off an Expert
// mid-story. So: the utterance must be SHORT (a command is a command, not a
// clause inside a paragraph about pausing a project), and it must match a
// whole phrase, not a substring. "Let's pause here" ends the recording;
// "we paused the excavation for two days" does not.

export type DriveVoiceCommand = "pause" | "resume" | "end";

/**
 * Longest an utterance may be and still be read as a command. Ten words is
 * roomy for "okay hang on, pause the interview for a second" and far short of
 * any sentence carrying real expertise.
 */
export const MAX_COMMAND_WORDS = 10;

/**
 * The phrase tables. Each entry is matched against the NORMALISED utterance
 * (lower case, punctuation stripped, whitespace collapsed) as a whole phrase
 * or as the whole utterance minus leading filler.
 *
 * These are deliberately plain English and deliberately few. Every one of them
 * is something a person says out loud in a car without being taught it.
 */
export const DRIVE_COMMAND_PHRASES: Record<DriveVoiceCommand, string[]> = {
  pause: [
    "pause",
    "pause the interview",
    "pause for a second",
    "pause for a minute",
    "hold on",
    "hold that thought",
    "give me a second",
    "give me a minute",
    "stop recording",
    "stop listening",
    "mute",
    "mute yourself",
    "let me think",
    "one second",
    "one moment",
  ],
  resume: [
    "resume",
    "resume the interview",
    "okay im back",
    "im back",
    "carry on",
    "keep going",
    "go ahead",
    "continue",
    "start listening",
    "unmute",
    "where were we",
  ],
  end: [
    "end the interview",
    "end interview",
    "finish the interview",
    "were done",
    "im done",
    "that's it for now",
    "thats it for now",
    "stop the interview",
    "wrap it up",
    "wrap up",
    "lets wrap up",
    "i have to go",
    "i've arrived",
    "ive arrived",
    "im here",
  ],
};

/** Leading words people put in front of a command without meaning anything. */
const LEADING_FILLER = [
  "ok",
  "okay",
  "alright",
  "all right",
  "um",
  "uh",
  "hey",
  "so",
  "well",
  "please",
  "can you",
  "could you",
  "would you",
  "i need to",
  "i want to",
  "lets",
  "let us",
];

/** Trailing politeness that must not defeat a match. */
const TRAILING_FILLER = ["please", "thanks", "thank you", "for me", "for now"];

export function normaliseUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(phrase: string): string {
  let out = phrase;
  let changed = true;
  while (changed) {
    changed = false;
    for (const filler of LEADING_FILLER) {
      if (out === filler) return "";
      if (out.startsWith(`${filler} `)) {
        out = out.slice(filler.length + 1);
        changed = true;
      }
    }
    for (const filler of TRAILING_FILLER) {
      if (out === filler) return "";
      if (out.endsWith(` ${filler}`)) {
        out = out.slice(0, out.length - filler.length - 1);
        changed = true;
      }
    }
  }
  return out.trim();
}

/**
 * Read one completed utterance as a command, or `null` when it is what it
 * almost always is: the Expert talking.
 *
 * `enabled` lets the surface honour the `masterwork.drive.voice_commands` knob
 * without every call site branching.
 */
export function matchDriveVoiceCommand(
  utterance: string,
  opts: { enabled?: boolean; maxWords?: number } = {},
): DriveVoiceCommand | null {
  if (opts.enabled === false) return null;
  const maxWords = opts.maxWords ?? MAX_COMMAND_WORDS;
  const normalised = normaliseUtterance(utterance);
  if (normalised.length === 0) return null;
  if (normalised.split(" ").length > maxWords) return null;

  const core = stripFiller(normalised);
  if (core.length === 0) return null;

  // `end` is checked first: "stop the interview" must never be read as the
  // "stop recording" pause. Longest-intent-first, not table order.
  const order: DriveVoiceCommand[] = ["end", "pause", "resume"];
  for (const command of order) {
    for (const phrase of DRIVE_COMMAND_PHRASES[command]) {
      const target = normaliseUtterance(phrase);
      if (core === target || normalised === target) return command;
    }
  }
  return null;
}
