/**
 * A HOST-WIRED VALUE IS NEVER THE PERSON'S OWN WORDS — a forcing function.
 *
 * Cold walk, jobs-bar-2026-09-16, the one sibling it left open. A purpose-built
 * conversation hands its agent the whole job as named launch variables, which
 * is exactly right under THE USER-INPUT LAW: the Conductor sends `rulebook_id`,
 * `attachments` and the entire rendered `rulebook_document`; the Scout
 * interview sends `interview_context_mode`, `interview_probes`,
 * `interview_closing_surprises` and `expert_goal`. What was wrong is that they
 * landed in `userValues` — the tier that means "the person set this" — so the
 * first user bubble opened by reciting the host's own vocabulary back at her:
 *
 *   "Rulebook Document: # … Rulebook id: a84d1c5e-… Status: draft · Version: 25"
 *   "Interview Probes: story_time · Interview Context Mode: blank_slate"
 *
 * 296518e291 stopped an Expert seeing that with the audience gate. This guard
 * holds the honest half: the launch path records authorship, and the user
 * bubble shows only what the person herself supplied — in EVERY audience,
 * builder included, which is where it still rendered on HEAD.
 *
 * Every case below drives the REAL reducer with the REAL action the launcher
 * dispatches, and reads the REAL selectors and the REAL display builder the
 * bubble renders through. Nothing here is hand-built state.
 */

import reducer, {
  createInstanceFullPayloadForTest,
} from "./host-wired-values.harness";
import {
  setHostVariableValues,
  setUserVariableValues,
  setUserVariableValue,
  clearUserVariableValue,
  resetUserVariableValues,
  initInstanceVariables,
  stampSubmittedFirstTurnValues,
  clearSubmittedFirstTurnValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectOwnVariableValues,
  selectUserVariableValues,
  selectVariablesForRequest,
  selectHostVariableNames,
  selectOwnSubmittedFirstTurnValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONVERSATION = "conv-1";
const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");
const read = (relative: string) =>
  readFileSync(join(REPO_ROOT, relative), "utf8");

type State = Parameters<ReturnType<typeof selectOwnVariableValues>>[0];
const wrap = (instanceVariableValues: unknown): State =>
  ({ instanceVariableValues }) as State;

/** The Conductor's real launch payload (ConductorPanel.tsx `runtime.variables`). */
const CONDUCTOR_LAUNCH = {
  rulebook_id: "a84d1c5e-0000-4000-8000-000000000001",
  attachments: '[{"entity_token":"rulebook","id":"a84d1c5e","name":"Pallets"}]',
  rulebook_document: "# Pallet Triage\n\nRule 1 — hand-sort anything sealed.",
};

/** The Scout interview's real launch payload (buildInterviewLaunchVariables). */
const INTERVIEW_LAUNCH = {
  rulebook_id: "a84d1c5e-0000-4000-8000-000000000001",
  interview_context_mode: "blank_slate",
  interview_probes: "story_time",
  interview_closing_surprises: "on",
  expert_goal: "How I decide which pallets need a manual sort",
};

function afterLaunch(values: Record<string, unknown>) {
  let state = reducer(
    undefined,
    createInstanceFullPayloadForTest(CONVERSATION),
  );
  state = reducer(
    state,
    setHostVariableValues({ conversationId: CONVERSATION, values }),
  );
  return wrap(state);
}

describe.each([
  ["the Conductor", CONDUCTOR_LAUNCH],
  ["the Scout interview", INTERVIEW_LAUNCH],
])("%s launch", (_name, launch) => {
  const state = afterLaunch(launch);

  it("renders NOTHING inside the user bubble — the person typed none of it", () => {
    expect(
      buildVariableDisplayLines(selectOwnVariableValues(CONVERSATION)(state)),
    ).toHaveLength(0);
  });

  it("is what made the bubble talk on HEAD: the raw user tier DOES carry it", () => {
    // The pre-fix reader, kept so the case above can never pass for the wrong
    // reason — if delivery itself broke, this goes empty and says so.
    expect(
      buildVariableDisplayLines(selectUserVariableValues(CONVERSATION)(state))
        .length,
    ).toBeGreaterThan(0);
  });

  it("still ships every value on the request — authorship is not delivery", () => {
    expect(selectVariablesForRequest(CONVERSATION)(state)).toEqual(launch);
  });

  it("records every launched name as the host's", () => {
    expect([...selectHostVariableNames(CONVERSATION)(state)].sort()).toEqual(
      Object.keys(launch).sort(),
    );
  });
});

describe("authorship moves one way only", () => {
  it("keeps the submitted first-turn display stable after draft cleanup and later edits", () => {
    let state = reducer(
      undefined,
      createInstanceFullPayloadForTest(CONVERSATION),
    );
    state = reducer(
      state,
      stampSubmittedFirstTurnValues({
        conversationId: CONVERSATION,
        values: { raw_instructions: "Original instructions", host_goal: "Hidden" },
        hostValueNames: ["host_goal"],
      }),
    );
    state = reducer(state, resetUserVariableValues(CONVERSATION));
    state = reducer(
      state,
      setUserVariableValues({
        conversationId: CONVERSATION,
        values: { raw_instructions: "A later composer draft" },
      }),
    );

    expect(selectOwnSubmittedFirstTurnValues(CONVERSATION)(wrap(state))).toEqual({
      raw_instructions: "Original instructions",
    });
  });

  it("releases an unaccepted first submit so an edited retry freezes new values", () => {
    let state = reducer(
      undefined,
      createInstanceFullPayloadForTest(CONVERSATION),
    );
    state = reducer(
      state,
      stampSubmittedFirstTurnValues({
        conversationId: CONVERSATION,
        values: { raw_instructions: "Failed draft" },
      }),
    );
    state = reducer(state, clearSubmittedFirstTurnValues(CONVERSATION));
    state = reducer(
      state,
      stampSubmittedFirstTurnValues({
        conversationId: CONVERSATION,
        values: { raw_instructions: "Corrected retry" },
      }),
    );

    expect(selectOwnSubmittedFirstTurnValues(CONVERSATION)(wrap(state))).toEqual({
      raw_instructions: "Corrected retry",
    });
  });

  it("releases the snapshot from both execution paths before a stream reader starts", () => {
    for (const file of [
      "features/agents/redux/execution-system/thunks/execute-instance.thunk.ts",
      "features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts",
    ]) {
      const source = read(file);
      expect(source).toContain("firstTurnSnapshotStamped && !streamStarted");
      expect(source).toContain("clearSubmittedFirstTurnValues(conversationId)");
    }
  });

  it("a value the person then edits becomes hers, and shows", () => {
    let state = reducer(
      undefined,
      createInstanceFullPayloadForTest(CONVERSATION),
    );
    state = reducer(
      state,
      setHostVariableValues({
        conversationId: CONVERSATION,
        values: INTERVIEW_LAUNCH,
      }),
    );
    state = reducer(
      state,
      setUserVariableValue({
        conversationId: CONVERSATION,
        name: "expert_goal",
        value: "What I actually meant",
      }),
    );
    expect(selectOwnVariableValues(CONVERSATION)(wrap(state))).toEqual({
      expert_goal: "What I actually meant",
    });
  });

  it("a plain user write is never silently claimed by the host", () => {
    let state = reducer(
      undefined,
      initInstanceVariables({ conversationId: CONVERSATION }),
    );
    state = reducer(
      state,
      setUserVariableValues({
        conversationId: CONVERSATION,
        values: { topic: "pallets" },
      }),
    );
    expect(selectOwnVariableValues(CONVERSATION)(wrap(state))).toEqual({
      topic: "pallets",
    });
  });

  it("clearing and resetting drop host ownership with the value", () => {
    let state = reducer(
      undefined,
      createInstanceFullPayloadForTest(CONVERSATION),
    );
    state = reducer(
      state,
      setHostVariableValues({
        conversationId: CONVERSATION,
        values: INTERVIEW_LAUNCH,
      }),
    );
    state = reducer(
      state,
      clearUserVariableValue({
        conversationId: CONVERSATION,
        name: "interview_probes",
      }),
    );
    expect(
      selectHostVariableNames(CONVERSATION)(wrap(state)),
    ).not.toContain("interview_probes");
    state = reducer(state, resetUserVariableValues(CONVERSATION));
    expect(selectHostVariableNames(CONVERSATION)(wrap(state))).toHaveLength(0);
  });
});

/**
 * THE CENSUS. The cases above prove the two launches that were reported; this
 * proves the CLASS. Every place the one launcher hands a surface's
 * `runtime.variables` to the slice must go through the host action — a fourth
 * launch path added later with `setUserVariableValues` would put the host's
 * words back in the person's mouth, and fails here.
 */
describe("every launch path records authorship", () => {
  const source = read(
    "features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts",
  );

  it("the launcher dispatches the host action on all three of its create paths", () => {
    const hostCalls =
      source.match(
        /setHostVariableValues\(\{ conversationId, values: variables \}\)/g,
      ) ?? [];
    expect(hostCalls).toHaveLength(3);
  });

  it("the launcher never writes launch variables through the user action", () => {
    expect(source).not.toContain(
      "setUserVariableValues({ conversationId, values: variables })",
    );
  });

  it("the user bubble reads the person's own values, never the raw user tier", () => {
    const bubble = read(
      "features/agents/components/messages-display/user/FirstTurnVariables.tsx",
    );
    expect(bubble).toContain("selectOwnSubmittedFirstTurnValues(conversationId)");
    expect(bubble).not.toContain("selectUserVariableValues(conversationId)");
  });
});
