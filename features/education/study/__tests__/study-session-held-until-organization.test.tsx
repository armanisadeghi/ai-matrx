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
import { gitFiles } from "@/scripts/lib/source-roots.cjs";
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
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getSetWithCards: async () => ({
      data: { set: { id: SET, name: "Greek" }, cards: CARDS },
      error: null,
    }),
    getCardsByIds: async () => ({ data: CARDS, error: null }),
  },
}));
jest.mock("@/features/education/study/service/planService", () => ({
  planService: { getActiveDailyItemCap: async () => null },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    createSession: () => createSession(),
    updateSession: async () => ({ data: null, error: null }),
    getMasteryBulk: async () => ({ data: [], error: null }),
    listDue: async () => ({
      data: CARDS.map((c) => ({ item_id: c.id })),
      error: null,
    }),
    recordAttempt: async () => ({
      data: { attemptId: "attempt-1", mastery: null },
      error: null,
    }),
    recordGameAnswer: async (input: { localResult: string }) => ({
      data: { result: input.localResult, mastery: { retrievability: 0.5 } },
      error: null,
    }),
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
const startGameSession = jest.fn(async (_roomId: string, _code: string) => ({
  data: { id: SESSION },
  error: null,
}));
jest.mock("@/features/education/engage/data/gameService", () => ({
  gameService: {
    startGameSession: (roomId: string, code: string) =>
      startGameSession(roomId, code),
  },
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
import { useDueReview } from "@/features/flashcards/data/useDueReview";
import { useQuizStudy } from "@/features/flashcards/data/useQuizStudy";
import { useMatchGame } from "@/features/flashcards/data/useMatchGame";
import { useGamePlay } from "@/features/education/engage/data/useGamePlay";
import { DEFAULT_ROOM_CONFIG } from "@/features/education/engage/types";
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

/**
 * A study session is written on the FIRST RECORDED ANSWER — never by opening a
 * mode. Opening a review and leaving used to write an empty "Unknown set ·
 * Adaptive" session that polluted history and fed the paid progress narrator.
 * Each mode below: held with no organization (nothing), organization chosen
 * and deck open (still nothing), first answer (exactly one), second answer
 * (still one).
 */
type Answerable = { sessionId: string | null };
const modes: Array<{
  label: string;
  use: (enabled: boolean) => Answerable;
  answer: (h: HookHandle<Answerable>, n: number) => Promise<void>;
}> = [
  {
    label: "set study (useFlashcardStudy)",
    use: (enabled) => useFlashcardStudy({ setId: SET, withSession: true, enabled }),
    answer: (h) =>
      h.act(async () => {
        await (h.current as ReturnType<typeof useFlashcardStudy>).grade("correct");
      }),
  },
  {
    label: "due review (useDueReview)",
    use: (enabled) => useDueReview({ enabled }),
    answer: (h) =>
      h.act(async () => {
        await (h.current as ReturnType<typeof useDueReview>).grade("correct");
      }),
  },
  {
    label: "test mode (useQuizStudy)",
    use: (enabled) => useQuizStudy({ setId: SET, withSession: true, enabled }),
    answer: async (h) => {
      const quiz = h.current as ReturnType<typeof useQuizStudy>;
      await h.act(async () => {
        await quiz.answer(quiz.current?.options[0] ?? "");
      });
      await h.act(async () => (h.current as ReturnType<typeof useQuizStudy>).next());
    },
  },
  {
    label: "match (useMatchGame)",
    use: (enabled) => useMatchGame({ setId: SET, withSession: true, enabled }),
    answer: async (h, n) => {
      const game = h.current as ReturnType<typeof useMatchGame>;
      const cardId = game.tiles.filter((t) => t.side === "front")[n]!.cardId;
      await h.act(async () => game.selectTile(`${cardId}-front`));
      await h.act(async () =>
        (h.current as ReturnType<typeof useMatchGame>).selectTile(`${cardId}-back`),
      );
    },
  },
];

describe("a study session is written on the first answer, never on open", () => {
  beforeEach(() => createSession.mockClear());

  it.each(modes.map((m) => [m.label, m] as const))(
    "%s: opening writes zero sessions; the first answer writes exactly one",
    async (_label, mode) => {
      const org = organizationSwitch();
      const hook = await renderHook<Answerable>(() => mode.use(org.useReady()));
      await drain(hook);
      expect(createSession).not.toHaveBeenCalled(); // held: no organization

      await hook.act(async () => org.choose());
      await drain(hook);
      expect(createSession).not.toHaveBeenCalled(); // open, no answer yet
      expect(hook.current.sessionId).toBeNull();

      await mode.answer(hook, 0);
      await drain(hook);
      expect(createSession).toHaveBeenCalledTimes(1); // first answer
      expect(hook.current.sessionId).toBe(SESSION);

      await mode.answer(hook, 1);
      await drain(hook);
      expect(createSession).toHaveBeenCalledTimes(1); // shared, never a second
      await hook.unmount();
    },
  );

  it("a quiz / practice test: opening and starting write nothing; the first answer opens it", async () => {
    const assessment = {
      id: "assessment-1",
      assessment_kind: "quiz",
      topic: null,
      source_kind: null,
      source_id: null,
    } as unknown as AssessmentRow;
    const items = [
      { id: "item-1", points: 1, question_type: "multiple_choice", correct_answer: "a" },
      { id: "item-2", points: 1, question_type: "multiple_choice", correct_answer: "b" },
    ] as unknown as AssessmentItemRow[];
    const org = organizationSwitch();
    const hook = await renderHook(() =>
      useTakeAssessment(assessment, items, { enabled: org.useReady() }),
    );
    await hook.act(async () => hook.current.start());
    expect(createSession).not.toHaveBeenCalled(); // held

    await hook.act(async () => org.choose());
    await hook.act(async () => hook.current.start());
    await drain(hook);
    expect(hook.current.started).toBe(true);
    expect(createSession).not.toHaveBeenCalled(); // started, no answer

    await hook.act(async () => {
      await hook.current.submit(items[0]!, "a");
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(hook.current.sessionId).toBe(SESSION);
    await hook.act(async () => {
      await hook.current.submit(items[1]!, "b");
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });
});

/**
 * A multiplayer player never chooses an organization: joining the room by its
 * code IS the permission, and the session opens through `start_game_session`,
 * filed under the ROOM's organization — and, like every mode, only on the
 * first answer.
 */
describe("a multiplayer game session belongs to the room", () => {
  beforeEach(() => {
    createSession.mockClear();
    startGameSession.mockClear();
  });

  it("opens through the room door on the first answer, never a direct insert", async () => {
    const hook = await renderHook(() =>
      useGamePlay({
        sourceKind: "set",
        sourceSetId: SET,
        config: DEFAULT_ROOM_CONFIG,
        mode: "multiplayer",
        roomId: "room-1",
        joinCode: "AB12C",
        autoStart: false,
      }),
    );
    await settle(hook, (h) => h.status === "ready", "queue ready");
    await drain(hook);
    expect(startGameSession).not.toHaveBeenCalled(); // open, no answer

    await hook.act(async () => hook.current.start());
    await hook.act(async () => hook.current.answer(0));
    await drain(hook);
    expect(startGameSession).toHaveBeenCalledTimes(1);
    expect(startGameSession).toHaveBeenCalledWith("room-1", "AB12C");
    expect(createSession).not.toHaveBeenCalled();
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
    // The app's files and @ai-matrx/chat's source (the aidream checkout beside this repo).
    const out = gitFiles(root, [
      "grep", "-l", "studyService.createSession(", "--",
      "features/*.ts", "../aidream/apps/shared/chat/src/*.ts", "features/*.tsx", "../aidream/apps/shared/chat/src/*.tsx",
      "app/*.ts", "app/*.tsx", "components/*.ts", "components/*.tsx",
    ]);
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
