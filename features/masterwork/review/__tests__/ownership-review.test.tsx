/**
 * THE "YES, THAT'S MINE" GUARDS (2026-09-15).
 *
 * Arman: "If the system is getting a result that the expert says 'Yes, that's
 * great' or simply gives a thumbs up, then we have the most important
 * indication we need." Doctrine CORE.md §5: the review is mine / not mine /
 * mine but wrong, and the last two rows are the next session's agenda.
 *
 * Three forcing functions, each failing on a real one-line regression:
 *
 *  1. THE WORDING IS ONLY WORDING. The REAL rule card (`RuleRow`, the row the
 *     Rulebook page renders) is driven in both vocabularies and the SAME button
 *     position is clicked. The words must differ and the HANDLER must not. Wire
 *     "Mine" to anything but `onApprove` — or let the ownership row lose one of
 *     its three words — and this fails.
 *  2. THE AGENDA IS EXACTLY THE LAST TWO ROWS. A Rulebook carrying every other
 *     state (approved, draft, retired-and-rejected, approved-with-a-change-
 *     request) must yield exactly the not-mine and mine-but-wrong ids, in that
 *     order. Widen or narrow either condition and this fails.
 *  3. A SIGNATURE GOES THROUGH THE EXISTING PATH. The thumbs-up is clicked on
 *     the REAL `ExpertSignOff`, with the supabase client mocked at the wire:
 *     it must reach `platform.upsert_output_feedback` with verdict `positive`
 *     and the signature surface, and it must touch NO table directly. Swap the
 *     RPC for a `.from("…").insert(…)` — the "just add a table" reflex this
 *     guard exists to stop — and this fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Rulebook, RulebookRule } from "../../types";
import { buildReviewAgenda } from "../agenda";
import {
  REVIEW_VOCABULARY_LABELS,
  expertIsAPerson,
  resolveReviewVocabulary,
} from "../vocabulary";
import { EXPERT_SIGNATURE_SURFACE } from "../signature";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Transport only — nothing below stubs a decision under test.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/masterwork/rb-1",
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  recordToast: jest.fn(),
}));

/** THE WIRE. Every write the sign-off makes has to come through here. */
const rpc = jest.fn(() => ({
  returns: () => Promise.resolve({ data: SAVED_ROW, error: null }),
}));
const from = jest.fn(() => {
  throw new Error(
    "output feedback must never touch a table directly — it goes through " +
      "platform.upsert_output_feedback",
  );
});
const SAVED_ROW = {
  id: "of-1",
  subject_type: "workflow_run",
  subject_id: "run-1",
  verdict: "positive",
  prose: null,
  request_id: null,
  surface_name: EXPERT_SIGNATURE_SURFACE,
  original_content: "the result",
  corrected_content: null,
  corrected_at: null,
  created_at: "2026-09-15T00:00:00Z",
};
jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ rpc, from }) },
  createClient: () => ({ schema: () => ({ rpc, from }) }),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { RuleRow } = require("../../components/detail/RulebookDetailPage");
const { ExpertSignOff } = require("../ExpertSignOff");
/* eslint-enable @typescript-eslint/no-require-imports */

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  jest.clearAllMocks();
});

const DRAFT_RULE: RulebookRule = {
  id: "r-draft",
  name: "Never open with the price",
  section: "A",
  statement: "Lead with what changes for them, never with the number.",
  severity: "major",
  draft: true,
};

function buttonLabelled(text: string): HTMLButtonElement {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === text);
  if (!match) {
    throw new Error(
      `no button labelled "${text}" — found: ${Array.from(
        container.querySelectorAll("button"),
      )
        .map((b) => JSON.stringify((b.textContent ?? "").trim()))
        .join(", ")}`,
    );
  }
  return match;
}

function renderRow(
  vocabulary: "standard" | "ownership",
  handlers: Record<string, jest.Mock>,
) {
  return (
    <RuleRow
      rule={DRAFT_RULE}
      allRules={[DRAFT_RULE]}
      canEdit
      vocabulary={vocabulary}
      onEdit={handlers.edit}
      onToggleRetired={handlers.retire}
      onApprove={handlers.approve}
      onReject={handlers.reject}
      onImprove={handlers.improve}
      onRequestChanges={handlers.requestChanges}
      onReconsider={handlers.reconsider}
      selected={false}
      onToggleSelected={handlers.select}
      recurrenceThreshold={null}
    />
  );
}

function freshHandlers() {
  return {
    edit: jest.fn(),
    retire: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    improve: jest.fn(),
    requestChanges: jest.fn(),
    reconsider: jest.fn(),
    select: jest.fn(),
  };
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("1 · the ownership wording maps to the SAME statuses", () => {
  it("'Mine' is the approve verb and 'Approve' is the same verb", () => {
    const ownership = freshHandlers();
    mount(renderRow("ownership", ownership));
    click(buttonLabelled(REVIEW_VOCABULARY_LABELS.ownership.approve));
    expect(ownership.approve).toHaveBeenCalledTimes(1);
    expect(ownership.reject).not.toHaveBeenCalled();
    expect(ownership.requestChanges).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();

    const standard = freshHandlers();
    mount(renderRow("standard", standard));
    click(buttonLabelled(REVIEW_VOCABULARY_LABELS.standard.approve));
    expect(standard.approve).toHaveBeenCalledTimes(1);
  });

  it("'Not mine' is the reject verb, and 'Mine but wrong' the change request", () => {
    const handlers = freshHandlers();
    mount(renderRow("ownership", handlers));
    click(buttonLabelled(REVIEW_VOCABULARY_LABELS.ownership.reject));
    expect(handlers.reject).toHaveBeenCalledTimes(1);
    click(buttonLabelled(REVIEW_VOCABULARY_LABELS.ownership.requestChanges));
    expect(handlers.requestChanges).toHaveBeenCalledTimes(1);
    expect(handlers.approve).not.toHaveBeenCalled();
  });

  it("shows the expert's words, never the standard ones, and vice versa", () => {
    mount(renderRow("ownership", freshHandlers()));
    const text = container.textContent ?? "";
    expect(text).toContain("Mine");
    expect(text).toContain("Not mine");
    expect(text).not.toContain("Draft — needs your approval");
  });
});

describe("1b · which wording a Rulebook gets", () => {
  const withIntake = (knowledge: string, rules: RulebookRule[] = []) =>
    ({
      id: "rb",
      name: "x",
      rules,
      metadata: { intake: { knowledge_lives: knowledge } },
    }) as unknown as Rulebook;

  it("a person's own knowledge gets the ownership words", () => {
    const rb = withIntake("In my head | In my meetings and calls");
    expect(expertIsAPerson(rb)).toBe(true);
    expect(resolveReviewVocabulary("auto", rb)).toBe("ownership");
  });

  it("somebody else's book gets the standard words — you cannot own it", () => {
    const rb = withIntake("Someone else's material (a book, a course)");
    expect(expertIsAPerson(rb)).toBe(false);
    expect(resolveReviewVocabulary("auto", rb)).toBe("standard");
  });

  it("no intake falls back to whether a person actually spoke", () => {
    const spoken = {
      id: "rb",
      name: "x",
      rules: [{ ...DRAFT_RULE, source_ref: { interview: true } }],
    } as unknown as Rulebook;
    expect(expertIsAPerson(spoken)).toBe(true);
  });

  it("the knob overrides the per-Rulebook answer in both directions", () => {
    const book = withIntake("Someone else's material (a book, a course)");
    const person = withIntake("In my head");
    expect(resolveReviewVocabulary("ownership", book)).toBe("ownership");
    expect(resolveReviewVocabulary("standard", person)).toBe("standard");
  });
});

describe("2 · the agenda is exactly the not-mine and mine-but-wrong rules", () => {
  const rule = (over: Partial<RulebookRule> & { id: string }): RulebookRule =>
    ({
      name: over.id,
      section: "A",
      statement: "s",
      severity: "minor",
      ...over,
    }) as RulebookRule;

  const RULEBOOK = {
    id: "rb",
    name: "x",
    rules: [
      rule({ id: "approved" }),
      rule({ id: "draft", draft: true }),
      rule({ id: "not-mine", rejected: true, draft: true, feedback: "I never say this." }),
      rule({ id: "wrong", feedback: "It's the other way round." }),
      rule({ id: "retired-and-rejected", rejected: true, retired: true, feedback: "old" }),
      rule({ id: "retired-with-feedback", retired: true, feedback: "old" }),
      rule({ id: "empty-feedback", feedback: "   " }),
    ],
  } as unknown as Rulebook;

  it("lists exactly those two, not-mine first", () => {
    const agenda = buildReviewAgenda(RULEBOOK);
    expect(agenda.map((a) => a.rule.id)).toEqual(["not-mine", "wrong"]);
    expect(agenda.map((a) => a.kind)).toEqual(["not_mine", "mine_but_wrong"]);
  });

  it("carries the Expert's own words", () => {
    const agenda = buildReviewAgenda(RULEBOOK);
    expect(agenda[0].words).toBe("I never say this.");
    expect(agenda[1].words).toBe("It's the other way round.");
  });

  it("is empty for a Rulebook nobody has pushed back on", () => {
    expect(
      buildReviewAgenda({
        id: "rb",
        name: "x",
        rules: [rule({ id: "a" }), rule({ id: "b", draft: true })],
      } as unknown as Rulebook),
    ).toEqual([]);
  });
});

describe("3 · a thumbs-up writes the verdict through the EXISTING path", () => {
  it("calls upsert_output_feedback with the signature surface, and no table", async () => {
    mount(
      <ExpertSignOff
        subjectType="workflow_run"
        subjectId="run-1"
        originalContent="the result"
        skipFetch
      />,
    );
    click(buttonLabelled("Yes, that's mine"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe("upsert_output_feedback");
    expect(args.p_verdict).toBe("positive");
    expect(args.p_subject_type).toBe("workflow_run");
    expect(args.p_subject_id).toBe("run-1");
    expect(args.p_surface_name).toBe(EXPERT_SIGNATURE_SURFACE);
    // NEVER A NEW TABLE: the mocked `.from` throws if anything reaches for one.
    expect(from).not.toHaveBeenCalled();
  });
});
