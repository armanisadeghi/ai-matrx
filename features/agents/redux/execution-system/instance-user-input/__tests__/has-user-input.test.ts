import type { RootState } from "@/lib/redux/store";
import { selectHasUserInput } from "../instance-user-input.selectors";

const CID = "11111111-1111-4111-8111-111111111111";

function stateWith({
  text = "",
  messageParts = [],
  resources = {},
}: {
  text?: string;
  messageParts?: Array<{ type: "text"; text: string }>;
  resources?: Record<string, unknown>;
}): RootState {
  return {
    instanceUserInput: {
      byConversationId: {
        [CID]: { text, messageParts },
      },
    },
    instanceResources: {
      byConversationId: { [CID]: resources },
    },
  } as unknown as RootState;
}

describe("selectHasUserInput", () => {
  test("counts an attached resource as input without typed text", () => {
    const state = stateWith({ resources: { image: { status: "ready" } } });
    expect(selectHasUserInput(CID)(state)).toBe(true);
  });

  test("counts a pending attachment as present user input", () => {
    const state = stateWith({ resources: { image: { status: "pending" } } });
    expect(selectHasUserInput(CID)(state)).toBe(true);
  });

  test("is false only when text, parts, and resources are all absent", () => {
    expect(selectHasUserInput(CID)(stateWith({}))).toBe(false);
  });
});
