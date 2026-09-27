/**
 * A study session is never started while no organization is chosen.
 *
 * Every `study_session` is filed under one organization; `studyService
 * .createSession` resolves it through `ensureOrgId`, which — with none selected
 * — raises the blocking "Which workspace is this for?" modal. A study surface
 * must instead hold: show `StudyOrganizationGate` (the inline organization
 * notice) and pass `enabled: useStudyOrganizationReady()` to its hook, so
 * nothing is written until the person picks one, then start on its own.
 *
 * This suite drives each session-starting hook with `enabled: false`, proves
 * `createSession` is NOT called, flips the organization to ready, and proves the
 * session then opens exactly once. The census at the bottom fails when a new
 * file starts a study session without being listed (and so covered) here.
 */

import "fake-indexeddb/auto";
import * as React from "react";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { renderHook, settle, type HookHandle } from "@/test-utils/renderHook";

const USER = "55555555-5555-4555-8555-555555555555";
const SET = "set-org-gate-1";
const SESSION = "session-org-gate-1";
const CARDS = [
  { id: "g-card-1", front: "alpha", back: "one" },
  { id: "g-card-2", front: "beta", back: "two" },
  { id: "g-card-3", front: "gamma", back: "three" },
  { id: "g-card-4", front: "delta", back: "four" },
];

const createSession = jest.fn(async () => ({
  data: { id: SESSION },
  error: null,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getSetWithCards: async () => ({
      data: { set: { id: SET, name: "Greek" }, cards: CARDS },
      error: null,
    }),
  },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    createSession: () => createSession(),
    updateSession: async () => ({ data: null, error: null }),
    getMasteryBulk: async () => ({ data: [], error: null }),
    recordAttempt: async () => ({ data: null, error: null }),
  },
}));
// The organization the person has chosen (or not), for the shared gate hooks.
const mockOrganization = { ready: false, listeners: new Set<() => void>() };
jest.mock("@/features/organizations/useOrganizationRequired", () => {
  const { useSyncExternalStore } = jest.requireActual("react");
  return {
    useOrganizationRequired: () => ({
      organizationState: useSyncExternalStore(
        (cb: () => void) => {
          mockOrganization.listeners.add(cb);
          return () => mockOrganization.listeners.delete(cb);
        },
        () => (mockOrganization.ready ? "ready" : "none"),
      ),
    }),
  };
});
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationRequiredNotice: () => null,
}));
jest.mock("@/features/education/assessment/data/assessmentService", () => ({
  assessmentService: {
    createResult: async () => ({ data: { id: "result-1" }, error: null }),
  },
}));
jest.mock("@/features/education/assessment/data/grading", () => ({
  gradeAnswerLocal: jest.fn(),
  gradeAnswerAI: jest.fn(),
  gradeAnswerImage: jest.fn(),
  isObjectiveType: () => true,
}));

import { useFlashcardStudy } from "@/features/flashcards/data/useFlashcardStudy";
import { useQuizStudy } from "@/features/flashcards/data/useQuizStudy";
import { useMatchGame } from "@/features/flashcards/data/useMatchGame";
import { useTakeAssessment } from "@/features/education/assessment/components/take/useTakeAssessment";
import {
  useHeldStudyStart,
  useStudyOrganizationReady,
} from "@/features/education/study/components/StudyOrganizationGate";
import type {
  AssessmentItemRow,
  AssessmentRow,
} from "@/features/education/assessment/data/types";

/** Stand-in for `useStudyOrganizationReady()`: false until the test picks one. */
function organizationSwitch() {
  let ready = false;
  const listeners = new Set<() => void>();
  return {
    useReady: () =>
      React.useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => ready,
      ),
    choose: () => {
      ready = true;
      for (const l of listeners) l();
    },
  };
}

async function drain<T>(hook: HookHandle<T>): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await hook.act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("a study session waits for an organization", () => {
  beforeEach(() => createSession.mockClear());

  const loaders: Array<[string, (enabled: boolean) => { sessionId: string | null }]> = [
    [
      "set study (useFlashcardStudy)",
      (enabled) => useFlashcardStudy({ setId: SET, withSession: true, enabled }),
    ],
    [
      "test mode (useQuizStudy)",
      (enabled) => useQuizStudy({ setId: SET, withSession: true, enabled }),
    ],
    [
      "match (useMatchGame)",
      (enabled) => useMatchGame({ setId: SET, withSession: true, enabled }),
    ],
  ];

  it.each(loaders)(
    "%s writes no session until an organization is chosen, then opens one",
    async (_label, useLoader) => {
      const org = organizationSwitch();
      const hook = await renderHook(() => useLoader(org.useReady()));
      await drain(hook);
      expect(createSession).not.toHaveBeenCalled();
      expect(hook.current.sessionId).toBeNull();

      await hook.act(async () => org.choose());
      await settle(hook, (h) => h.sessionId === SESSION, "session");
      expect(createSession).toHaveBeenCalledTimes(1);
      await hook.unmount();
    },
  );

  it("a quiz / practice test start writes nothing without an organization", async () => {
    const assessment = {
      id: "assessment-1",
      assessment_kind: "quiz",
      topic: null,
      source_kind: null,
      source_id: null,
    } as unknown as AssessmentRow;
    const items = [{ id: "item-1", points: 1 }] as unknown as AssessmentItemRow[];
    const org = organizationSwitch();
    const hook = await renderHook(() =>
      useTakeAssessment(assessment, items, { enabled: org.useReady() }),
    );
    await hook.act(async () => hook.current.start());
    expect(createSession).not.toHaveBeenCalled();
    expect(hook.current.sessionId).toBeNull();

    await hook.act(async () => org.choose());
    await hook.act(async () => hook.current.start());
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(hook.current.sessionId).toBe(SESSION);
    await hook.unmount();
  });
});

/**
 * The click-started modes (FastFire, spoken practice, audio review, Grade My
 * Work) keep their setup visible; only Start holds. Pressed with no
 * organization, the start is held — nothing runs, nothing is written — and it
 * runs by itself, once, with the LATEST handler (the one whose hook is now
 * enabled), as soon as an organization is chosen.
 */
describe("a click-started study mode holds its Start for an organization", () => {
  beforeEach(() => {
    mockOrganization.ready = false;
  });

  it("holds Start with no organization, then starts once when one is picked", async () => {
    const calls: Array<{ arg: string; readyWhenRun: boolean }> = [];
    const hook = await renderHook(() => {
      const ready = useStudyOrganizationReady();
      return useHeldStudyStart((arg: string) => {
        calls.push({ arg, readyWhenRun: ready });
      });
    });
    expect(hook.current.ready).toBe(false);

    await hook.act(async () => hook.current.start("drill"));
    expect(calls).toEqual([]);
    expect(hook.current.held).toBe(true);

    await hook.act(async () => {
      mockOrganization.ready = true;
      for (const l of mockOrganization.listeners) l();
    });
    await drain(hook);
    // Ran exactly once, through the handler of the render where it was ready.
    expect(calls).toEqual([{ arg: "drill", readyWhenRun: true }]);
    expect(hook.current.held).toBe(false);

    // With an organization, Start runs at once (inside the click gesture).
    await hook.act(async () => hook.current.start("again"));
    expect(calls).toEqual([
      { arg: "drill", readyWhenRun: true },
      { arg: "again", readyWhenRun: true },
    ]);
    await hook.unmount();
  });
});

/**
 * Every file that opens a study session, each holding for an organization
 * through `enabled: useStudyOrganizationReady()` + `StudyOrganizationGate`.
 * A new one must adopt the same gate — and be added here.
 */
const GATED_SESSION_STARTERS = [
  "features/education/assessment/components/take/useTakeAssessment.ts",
  "features/education/assessment/grade-work/useGradeWork.ts",
  "features/education/engage/data/useGamePlay.ts",
  "features/education/media/audio/components/AudioReviewSession.tsx",
  "features/education/spoken-practice/hooks/useSpokenPractice.ts",
  "features/flashcards/data/useDueReview.ts",
  "features/flashcards/data/useFlashcardStudy.ts",
  "features/flashcards/data/useMatchGame.ts",
  "features/flashcards/data/useQuizStudy.ts",
  "features/flashcards/data/useWeakAreaDrill.ts",
  "features/flashcards/fast-fire/hooks/useFastFireLauncher.ts",
];

describe("census: every study-session starter is gated", () => {
  const root = path.resolve(__dirname, "../../../..");

  it("no file opens a study session without being a gated starter", () => {
    const out = execSync(
      "git grep -l 'studyService.createSession(' -- 'features/*.ts' 'features/*.tsx' 'app/*.ts' 'app/*.tsx' 'components/*.ts' 'components/*.tsx'",
      { cwd: root, encoding: "utf8" },
    );
    const starters = out
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => {
        // Code, not a comment: some line calls it outside `//` / `*` prose.
        return readFileSync(path.join(root, f), "utf8")
          .split("\n")
          .some((line) => {
            const t = line.trim();
            return (
              t.includes("studyService.createSession(") &&
              !t.startsWith("//") &&
              !t.startsWith("*")
            );
          });
      })
      .sort();
    expect(starters).toEqual([...GATED_SESSION_STARTERS].sort());
  });
});
