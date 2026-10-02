import {
  FILL_FORM_INSTRUCTION,
  TYPE_MESSAGE_INSTRUCTION,
  emptyStateInstruction,
} from "./empty-state-instruction";

// The feedback-triage agents carry five form fields (description, route,
// filed_type, filed_priority, comments) and a description.
describe("emptyStateInstruction", () => {
  it("a form-driven agent is told to fill in the fields, description or not", () => {
    expect(
      emptyStateInstruction({
        formFieldCount: 5,
        formShown: true,
        hasDescription: true,
      }),
    ).toBe(FILL_FORM_INSTRUCTION);
    expect(
      emptyStateInstruction({
        formFieldCount: 5,
        formShown: true,
        hasDescription: false,
      }),
    ).toBe(FILL_FORM_INSTRUCTION);
  });

  // Cold walk 23, defect C: the Masterwork interview hides the Scout's
  // pre-filled variables ("Hide Form Inputs"), yet the empty state still said
  // "Fill in the fields below and run." over a chat box with no fields.
  it("never points at a form the surface hides", () => {
    expect(
      emptyStateInstruction({
        formFieldCount: 6,
        formShown: false,
        hasDescription: true,
      }),
    ).toBeNull();
    expect(
      emptyStateInstruction({
        formFieldCount: 6,
        formShown: false,
        hasDescription: false,
      }),
    ).toBe(TYPE_MESSAGE_INSTRUCTION);
  });

  it("an agent with no form points at the composer only when nothing else speaks", () => {
    expect(
      emptyStateInstruction({
        formFieldCount: 0,
        formShown: true,
        hasDescription: false,
      }),
    ).toBe(TYPE_MESSAGE_INSTRUCTION);
    expect(
      emptyStateInstruction({
        formFieldCount: 0,
        formShown: true,
        hasDescription: true,
      }),
    ).toBeNull();
  });
});

// The gate itself: what the empty state reads must be what the renderers do.
// Review of the first fix found the interview hides its form with
// `variablesPanelStyle: "hidden"` (SmartAgentVariables renders null), so a
// "Show Form Inputs" press flipped `showVariablePanel` and brought the
// sentence back over a chat box with nothing in it.
import { selectIsVariableFormShown } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { RootState } from "@/lib/redux/store";

function stateWith(ui: Record<string, unknown>): RootState {
  return {
    instanceVariableValues: {
      byConversationId: { c1: { definitions: [{ name: "rulebook_id" }] } },
    },
    messages: { byConversationId: { c1: { orderedIds: [] } } },
    conversations: { byConversationId: { c1: { status: "ready" } } },
    instanceUIState: { byConversationId: { c1: ui } },
  } as unknown as RootState;
}

describe("selectIsVariableFormShown", () => {
  it("is true only when the panel is on and the style draws a form", () => {
    expect(selectIsVariableFormShown("c1")(stateWith({ showVariablePanel: true }))).toBe(true);
    expect(selectIsVariableFormShown("c1")(stateWith({ showVariablePanel: false }))).toBe(false);
  });

  it("a 'hidden' style draws no form, whatever the panel toggle says", () => {
    expect(
      selectIsVariableFormShown("c1")(
        stateWith({ showVariablePanel: true, variablesPanelStyle: "hidden" }),
      ),
    ).toBe(false);
  });
});
