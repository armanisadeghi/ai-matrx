// features/masterwork/record/interviewModes.ts
//
// THE TWO WAYS OF BEING INTERVIEWED, and the five ways of being dug into.
//
// Arman, 2026-09-15:
//   "Ninety percent of the expertise I possess is not documented anywhere, or the
//    documentation is partially wrong. My words are the most important. AI models
//    get fixated on the information you put in front of them; once fixated, the
//    interview becomes fixing the documentation instead of capturing reality. So
//    there are two ways of doing an interview: the agent has all the context, or
//    the agent has no context to begin with. Both are great. Make them two modes,
//    engaged by user preference or by the system recognizing which works better."
//
// Ruling doctrine: `common-docs/systems/masterwork/doctrine/CORE.md` §7 (the
// interviewer has two modes, BOTH offered) and §8 (the forks-are-modes law).
// The probe vocabulary is `advantage-stack.md` Part III §3.1, stages 1.2–1.6.
//
// 🚨 THIS MODULE HOLDS NO INSTRUCTION TEXT. The interviewer's prose for every
// mode and every probe lives in its own `agent.definition` row, where an agent's
// definition belongs (Arman, 2026-08-16: "the code base is nothing more than the
// connection, but not the definition and the details and can never be those
// things"). What lives here is the VOCABULARY the code switches on, the one
// plain sentence the Expert reads per option, and the launch payload — nothing
// the model reads as instructions.
//
// The knob register (`platform.feature_knob`, feature `masterwork.interview`)
// owns every default; see `useInterviewSettings.ts`. There is no code default
// anywhere in this file on purpose.

/** What the interviewer is handed before its first question. */
export type InterviewContextMode = "primed" | "blank_slate";

/** The stored setting, which may defer the choice to the Rulebook's own state. */
export type InterviewContextModeSetting = InterviewContextMode | "auto";

export type InterviewProbe =
  | "adaptive"
  | "contrast"
  | "correction_log"
  | "prediction_then_reveal"
  | "withheld_replay"
  | "boundary_hunting";

export interface InterviewOption<T extends string> {
  id: T;
  /** What the Expert sees as the option's name. Never a codename. */
  title: string;
  /** ONE plain sentence. This is the whole explanation the screen gives. */
  sentence: string;
}

/**
 * The two modes, in the order the screen offers them. Both are good — the copy
 * must never rank them, because Arman did not.
 */
export const INTERVIEW_CONTEXT_MODES: readonly InterviewOption<InterviewContextMode>[] =
  [
    {
      id: "primed",
      title: "It has read everything first",
      sentence:
        "The interviewer reads your rulebook, your sources and everything you have already said before it asks anything, so it never wastes your time asking what it could have looked up.",
    },
    {
      id: "blank_slate",
      title: "It knows nothing about you",
      sentence:
        "The interviewer is given only your name and what you are building, so it cannot get stuck on your documents and turn the session into fixing them instead of capturing how you actually work.",
    },
  ] as const;

/**
 * The probe styles, in the order the screen offers them. `adaptive` is first
 * because it is the shipped default and the right answer for most sessions.
 */
export const INTERVIEW_PROBES: readonly InterviewOption<InterviewProbe>[] = [
  {
    id: "adaptive",
    title: "Let it choose",
    sentence:
      "The interviewer picks whichever way of digging fits what you just said, and switches whenever one stops working.",
  },
  {
    id: "contrast",
    title: "Where you differ",
    sentence:
      "It asks what someone else who is good at your job would do here that you never would.",
  },
  {
    id: "correction_log",
    title: "What you keep fixing",
    sentence:
      "It asks what you find yourself correcting over and over in someone junior's work — every annoyance is a rule.",
  },
  {
    id: "prediction_then_reveal",
    title: "Predict, then reveal",
    sentence:
      "You describe a real case you handled, it asks what a competent peer would have done, and only then what you did and why.",
  },
  {
    id: "withheld_replay",
    title: "Redo an old case cold",
    sentence:
      "You work an old case again from memory, and it compares that with what you actually did at the time.",
  },
  {
    id: "boundary_hunting",
    title: "Find the edges",
    sentence:
      "It invents cases that are nearly but not quite yours, one after another, until you say you would never see that.",
  },
] as const;

const PROBE_IDS = new Set<string>(INTERVIEW_PROBES.map((probe) => probe.id));

export function isInterviewProbe(value: unknown): value is InterviewProbe {
  return typeof value === "string" && PROBE_IDS.has(value);
}

export function contextModeOption(
  mode: InterviewContextMode,
): InterviewOption<InterviewContextMode> {
  const found = INTERVIEW_CONTEXT_MODES.find((option) => option.id === mode);
  if (!found) throw new Error(`unknown interview context mode: ${mode}`);
  return found;
}

export function probeOption(probe: InterviewProbe): InterviewOption<InterviewProbe> {
  const found = INTERVIEW_PROBES.find((option) => option.id === probe);
  if (!found) throw new Error(`unknown interview probe: ${probe}`);
  return found;
}

/**
 * Turn the stored setting into the mode this session actually runs.
 *
 * `auto` IS Arman's own rule, and nothing else: blank slate when the Rulebook
 * has no sources to read (so there is nothing to fixate on and nothing the
 * primed interviewer could have looked up), primed when it has.
 */
export function resolveContextMode(
  setting: InterviewContextModeSetting,
  hasSources: boolean,
): InterviewContextMode {
  if (setting === "primed" || setting === "blank_slate") return setting;
  return hasSources ? "primed" : "blank_slate";
}

/** The sentence the start screen shows under an `auto`-resolved choice. */
export function autoReason(hasSources: boolean): string {
  return hasSources
    ? "Chosen for you because this rulebook already has sources worth reading."
    : "Chosen for you because there is nothing written down yet — your words are the only source.";
}

export interface InterviewLaunchInput {
  rulebookId: string;
  /** The Expert's own name, as the platform knows it. */
  expertName: string;
  /** The Rulebook's name — one line of what they are building. */
  rulebookName: string;
  mode: InterviewContextMode;
  probes: readonly InterviewProbe[];
  closingSurprises: boolean;
  /**
   * The rendered Rulebook. REQUIRED in `primed` mode (disease D4: the document
   * is bound before turn 1, never fetched by the model) and IGNORED in
   * `blank_slate` mode, where handing it over is the whole thing we are not
   * doing.
   */
  rulebookDocument: string | null;
}

export type InterviewLaunchVariables = {
  rulebook_id: string;
  interview_context_mode: InterviewContextMode;
  interview_probes: string;
  interview_closing_surprises: "on" | "off";
  expert_goal: string;
  /** Present in `primed` mode ONLY — the key is absent in `blank_slate`. */
  rulebook_document?: string;
};

/**
 * THE LAUNCH PAYLOAD — the one place the mode becomes something the interviewer
 * actually receives. `masterwork.scout`'s provision offers exactly these values
 * (aidream `services/mandates/client_mandates.py`,
 * `MASTERWORK_SCOUT_INTERVIEW_PROVISION`), and its `agent.definition` row
 * substitutes each one into its instructions.
 *
 * 🚨 In `blank_slate` mode the `rulebook_document` key is ABSENT, not empty —
 * the guard `__tests__/interviewModes.test.ts` proves that no source text rides
 * along in any field, because "the agent has no context to begin with" is a
 * claim the screen makes to the Expert and a claim we have to be able to keep.
 */
export function buildInterviewLaunchVariables(
  input: InterviewLaunchInput,
): InterviewLaunchVariables {
  const probes = input.probes.length > 0 ? input.probes : (["adaptive"] as const);
  const base: InterviewLaunchVariables = {
    rulebook_id: input.rulebookId,
    interview_context_mode: input.mode,
    interview_probes: [...probes].join(", "),
    interview_closing_surprises: input.closingSurprises ? "on" : "off",
    // Name and goal, and nothing else. The Rulebook's NAME is what the Expert
    // typed when they said what they were building; its description, its
    // intake answers and its rules are all source text and none of them belong
    // here.
    expert_goal: `${input.expertName} is building a rulebook called "${input.rulebookName}".`,
  };
  if (input.mode === "primed") {
    if (!input.rulebookDocument) {
      throw new Error(
        "a primed interview cannot be launched without the rendered Rulebook — " +
          "that is disease D4, and the caller must refuse instead of guessing.",
      );
    }
    base.rulebook_document = input.rulebookDocument;
  }
  return base;
}
