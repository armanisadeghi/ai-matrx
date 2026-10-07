/**
 * THE SHAPE INTERACTION SEAM — interaction state that never touches the answer
 * text rides the next message as ONE `interaction` chip per shape instance,
 * through the real `emitKindInteraction` over the real root reducer (only the
 * knob read is a stand-in).
 *
 * Forcing functions:
 *   1. a recipe interaction stages one chip with a human summary and title;
 *   2. a second interaction on the same shape updates that chip;
 *   3. pure view state (a presentation slide, a comparison sort, a
 *      troubleshooting row expanded) never stages;
 *   4. an answer state back to nothing removes the chip;
 *   5. two shapes in one answer are two chips;
 *   6. the knob off → nothing.
 *
 * Use case: Marco cooks the agent's weeknight chili and ticks ingredients.
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  REMARKS_BLOCK_TYPE,
  remarkSourceOf,
  type InteractionRemark,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { emitKindInteraction, type KindInteractionEvent } from "../kind-interaction";

let knobOn = true;
jest.mock("@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-knob", () => ({
  remarksAutoIncludeEnabled: async () => knobOn,
}));

const CID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const MID = "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d";
const CHILI = { title: "Weeknight chili", ingredients: [1, 2, 3, 4, 5, 6], instructions: [1, 2, 3, 4] };

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}
type S = ReturnType<typeof makeStore>;

function chips(s: S): { id: string; remark: InteractionRemark }[] {
  const bucket = s.getState().instanceResources.byConversationId[CID] ?? {};
  return Object.values(bucket)
    .filter((r) => r.blockType === REMARKS_BLOCK_TYPE)
    .flatMap((r) => {
      const src = remarkSourceOf(r);
      return src?.remark.kind === "interaction" ? [{ id: r.resourceId, remark: src.remark }] : [];
    });
}

function emit(s: S, event: Partial<KindInteractionEvent> & Pick<KindInteractionEvent, "kind" | "state">) {
  return s.dispatch(
    emitKindInteraction({ conversationId: CID, messageId: MID, blockIndex: 2, ...event }) as never,
  ) as unknown as Promise<string | null>;
}

beforeEach(() => {
  knobOn = true;
});

test("a recipe interaction stages one chip with a summary and the shape's title", async () => {
  const s = makeStore();
  await emit(s, { kind: "recipe", title: "Weeknight chili", data: CHILI, state: { checkedIngredients: [0, 1], completedSteps: [], servingMultiplier: 1 }, previous: null });
  const [chip] = chips(s);
  expect(chips(s)).toHaveLength(1);
  expect(chip.remark).toMatchObject({
    shape: "recipe",
    title: "Weeknight chili",
    summary: "I checked 2 of 6 ingredients.",
    target: { conversationId: CID, messageId: MID, blockIndex: 2 },
  });
});

test("another interaction on the same shape updates the same chip", async () => {
  const s = makeStore();
  await emit(s, { kind: "recipe", data: CHILI, state: { checkedIngredients: [0], completedSteps: [] }, previous: null });
  const [first] = chips(s);
  await emit(s, { kind: "recipe", data: CHILI, state: { checkedIngredients: [0], completedSteps: [0, 1] }, previous: { checkedIngredients: [0], completedSteps: [] } });
  expect(chips(s)).toHaveLength(1);
  expect(chips(s)[0].id).toBe(first.id);
  expect(chips(s)[0].remark.summary).toBe("I checked 1 of 6 ingredients, finished 2 of 4 steps.");
});

test("pure view state never stages", async () => {
  const s = makeStore();
  await emit(s, { kind: "presentation", state: { currentSlide: 3 }, previous: { currentSlide: 2 } });
  await emit(s, { kind: "comparison", state: { sortBy: "price", sortDirection: "asc" }, previous: null });
  await emit(s, {
    kind: "troubleshooting",
    state: { completedSteps: ["restart"], expandedIssues: ["wifi"], expandedSolutions: [] },
    previous: { completedSteps: ["restart"], expandedIssues: [], expandedSolutions: [] },
  });
  expect(chips(s)).toHaveLength(0);
});

test("a progress step is named by its words, not its id", async () => {
  const s = makeStore();
  const data = { phases: [{ id: "category-1", steps: [{ id: "item-1", text: "Book the venue" }] }] };
  await emit(s, { kind: "progress", data, state: { completed: ["item-1"] }, previous: null });
  expect(chips(s)[0].remark.summary).toBe("I marked done: Book the venue.");
});

test("a null progress step cannot crash lookup of a missing answer id", async () => {
  const s = makeStore();
  const data = { phases: [{ steps: [null, { id: "item-1", text: "Book the venue" }] }] };
  await emit(s, { kind: "progress", data, state: { completed: [undefined, "item-1"] }, previous: null });
  expect(chips(s)[0].remark.summary).toBe("I marked done: undefined, Book the venue.");
});

test("answer state back to nothing removes the chip", async () => {
  const s = makeStore();
  await emit(s, { kind: "progress", state: { completed: ["Book venue"] }, previous: null });
  expect(chips(s)).toHaveLength(1);
  await emit(s, { kind: "progress", state: { completed: [] }, previous: { completed: ["Book venue"] } });
  expect(chips(s)).toHaveLength(0);
});

test("two shapes in one answer are two chips", async () => {
  const s = makeStore();
  await emit(s, { kind: "progress", blockIndex: 1, state: { completed: ["Book venue"] }, previous: null });
  await emit(s, { kind: "quiz", blockIndex: 4, state: { results: { correctCount: 7, totalQuestions: 10, scorePercentage: 70 } } });
  expect(chips(s).map((c) => c.remark.summary).sort()).toEqual(["I marked done: Book venue.", "I scored 7/10 (70%)."]);
});

test("knob off: nothing stages", async () => {
  knobOn = false;
  const s = makeStore();
  await emit(s, { kind: "progress", state: { completed: ["Book venue"] }, previous: null });
  expect(chips(s)).toHaveLength(0);
});
