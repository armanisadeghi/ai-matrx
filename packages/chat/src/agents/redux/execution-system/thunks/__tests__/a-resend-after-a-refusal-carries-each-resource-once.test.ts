/**
 * Refuse -> Retry: the refused send's note/task/upload parts are restored to
 * the composer (retry-turn re-seeds messageParts) while the same resources are
 * still attached. The re-send must carry each resource once.
 */
import {
  agentUserInputFromSubmission,
  type FrozenSubmission,
} from "../frozen-submission";
import type { UserInputPart } from "../../../../types/request.types";

const note = (label: string) =>
  ({
    type: "input_notes",
    note_ids: ["4929e377-a2fc-4d97-8ee3-79cdd42857a0"],
    metadata: { label },
  }) as unknown as UserInputPart;
const task = {
  type: "input_task",
  task_ids: ["t1"],
} as unknown as UserInputPart;
const upload = {
  type: "media",
  kind: "document",
  url: "https://x/f.pdf",
} as unknown as UserInputPart;

function submission(
  messageParts: UserInputPart[],
  resources: UserInputPart[],
): FrozenSubmission {
  return {
    text: "hi",
    messageParts,
    resources,
    resourceIds: [],
    editorResourceXml: "",
    userValues: {},
  };
}

describe("re-send after a usage refusal", () => {
  it("carries a restored note + still-attached note once", () => {
    const out = agentUserInputFromSubmission(
      submission([note("Insurance")], [note("Insurance (attached)"), upload]),
    ) as UserInputPart[];
    expect(out.filter((p) => (p as { type: string }).type === "input_notes")).toHaveLength(1);
    expect(out.filter((p) => (p as { type: string }).type === "media")).toHaveLength(1);
  });

  it("carries a restored task once", () => {
    const out = agentUserInputFromSubmission(
      submission([task], [task]),
    ) as UserInputPart[];
    expect(out.filter((p) => (p as { type: string }).type === "input_task")).toHaveLength(1);
  });

  it("keeps two different notes", () => {
    const other = { ...(note("x") as object), note_ids: ["other"] } as unknown as UserInputPart;
    const out = agentUserInputFromSubmission(
      submission([note("a")], [other]),
    ) as UserInputPart[];
    expect(out.filter((p) => (p as { type: string }).type === "input_notes")).toHaveLength(2);
  });
});
