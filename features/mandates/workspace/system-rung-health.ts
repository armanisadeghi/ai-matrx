// features/mandates/workspace/system-rung-health.ts
//
// IS THE SYSTEM'S OWN ANSWER SOUND? — one sentence, one remedy, both derived
// from the DOOR rather than re-derived on the client.
//
// 🚨 WHAT CHANGED AND WHY (FIX-R9, 2026-09-08). This module used to walk the
// holder's `output_schema` itself and write its own verdict — a second judge
// beside `mandate._rungs`, which is the class this campaign exists to kill.
// V-PARITY/UX found both halves of the cost on production:
//
//   F2 — `dropped_code`, the 22nd column FIX-R7 shipped precisely so a client
//        would stop matching on sentences, had ZERO consumers in the frontend;
//   F3 — this file told an ORG-homed job's admin page *"Agent Goal Writer
//        answers this job for every user on the platform."*, ten lines above
//        the same page's own correct *"Everyone in Write Target Sandbox runs
//        this"*. The scope was hardcoded; it belongs to the mandate's HOME.
//
// So: the DEFECT is the door's (`dropped_code` + `dropped_reason`, printed in
// the database's own words), and the SCOPE is the home's. This module turns
// those two facts into the words on the screen and derives nothing else.

/** The door's discriminator — `mandate._rungs`' 22nd column (aidream 0599). */
export type DroppedCode =
  | "platform_disabled"
  | "holder_unreachable"
  | "output_contract_unmet";

export interface SystemRungHealth {
  /** What is true, in one sentence. Never a hedge, never a euphemism. */
  sentence: string;
  /** What to do about it, named — `null` only when there is nothing to do. */
  remedy: string | null;
  /** `true` when the system answer cannot run as written. */
  broken: boolean;
}

export interface HomeScope {
  /** Is the mandate homed in the Matrx System organization? */
  systemHomed: boolean;
  /** That organization's name, when this screen has read it. */
  organizationName: string | null;
}

export interface SystemRungFacts {
  /** Has the door answered yet? A verdict is never invented from silence. */
  status: "reading" | "read" | "unreadable";
  /**
   * The door's own reason for setting this rung aside — printed VERBATIM.
   * `null` when the rung can run.
   */
  droppedCode: DroppedCode | string | null;
  droppedReason: string | null;
  /** Who the rung names, for the healthy sentence. */
  holderName: string | null;
  holderIsWorkflow: boolean;
  holderSet: boolean;
  /** WHO this rung answers for — the mandate's HOME decides it, never the UI. */
  home: HomeScope;
}

/**
 * WHO A HOME-SCOPED RUNG ANSWERS FOR (F3). A system-homed job's default is the
 * answer every user on the platform gets; an org-homed job's default answers
 * for that ONE organization, named. An unread name says so — it never prints an
 * id and never falls back to the platform-wide claim, which is the lie F3 was.
 */
export function homeScopePhrase(home: HomeScope): string {
  if (home.systemHomed) return "every user on the platform";
  return home.organizationName
    ? `every member of ${home.organizationName}`
    : "every member of the organization that homes this job";
}

/** The remedy for each thing the door can say. One sentence, always an action. */
function remedyFor(code: string): string | null {
  switch (code) {
    case "output_contract_unmet":
      return "Assign a holder that declares the output this job requires, or give this one that output schema.";
    case "holder_unreachable":
      return "Assign a holder the organization this job answers for can open.";
    case "platform_disabled":
      return "Assign a different holder, or ask a platform administrator to turn this one back on.";
    default:
      // An unknown code is a newer database than this browser. The door's own
      // sentence still stands; inventing a remedy for it would not.
      return null;
  }
}

export function systemRungHealth(facts: SystemRungFacts): SystemRungHealth {
  if (facts.status === "reading") {
    return {
      sentence: "Reading how the platform answers this job…",
      remedy: null,
      broken: false,
    };
  }
  if (facts.status === "unreadable") {
    return {
      sentence: "Whether this assignment can run could not be read just now.",
      remedy: "Reload the page.",
      broken: false,
    };
  }

  if (facts.droppedReason || facts.droppedCode) {
    return {
      // The DATABASE'S WORDS. A client sentence beside them would be a second
      // judge, and the two would disagree the day the rule changes.
      sentence:
        facts.droppedReason ??
        "The platform set this assignment aside, and the reason did not reach this screen.",
      remedy: remedyFor(facts.droppedCode ?? ""),
      broken: true,
    };
  }

  const scope = homeScopePhrase(facts.home);
  if (!facts.holderSet) {
    return {
      sentence: `Nothing is assigned, so nothing runs this job for ${scope}.`,
      remedy: "Choose an agent or a workflow above.",
      broken: true,
    };
  }

  const who = facts.holderIsWorkflow
    ? "A workflow"
    : (facts.holderName ?? "The assigned agent");
  return {
    sentence: `${who} answers this job for ${scope}.`,
    remedy: null,
    broken: false,
  };
}
