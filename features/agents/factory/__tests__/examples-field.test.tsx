/**
 * R52: the Examples field is ONE shared component (generate page + make-from-chat window),
 * and the from-chat client sends the person's examples on the request body.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@/components/official/VoiceTextarea", () => ({
  VoiceTextarea: (props: Record<string, unknown>) => (
    <textarea
      aria-label={props["aria-label"] as string}
      value={props.value as string}
      onChange={props.onChange as never}
      disabled={props.disabled as boolean}
    />
  ),
}));

import { ExamplesField, filledExamples } from "../components/ExamplesField";

describe("ExamplesField", () => {
  it("counts filled examples against 3 and reports edits", () => {
    const seen: string[][] = [];
    const host = document.createElement("div");
    act(() => {
      createRoot(host).render(<ExamplesField examples={["a", " ", ""]} onChange={(e) => seen.push(e)} />);
    });
    expect(host.textContent).toContain("1 of 3 to prove it");
    expect(host.querySelectorAll("textarea")).toHaveLength(3);
    const area = host.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(area, "abc");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(seen.at(-1)).toEqual(["abc", " ", ""]);
  });

  it("filledExamples trims and drops blanks", () => {
    expect(filledExamples([" a ", "", "  "])).toEqual(["a"]);
  });
});

describe("one Examples field, used in both places", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("the generator and the from-chat window both mount the shared component, neither copies it", () => {
    const gen = read("features/agents/agent-creators/interactive-builder/AgentGenerator.tsx");
    const win = read("features/window-panels/windows/agent-from-chat/AgentFromChatWindow.tsx");
    for (const src of [gen, win]) {
      expect(src).toContain("<ExamplesField");
      expect(src).not.toContain("to prove it");
    }
  });
});

describe("makeAgentFromChat sends the examples", () => {
  it("puts non-blank examples in the request body", async () => {
    const calls: Record<string, unknown>[] = [];
    jest.resetModules();
    jest.doMock("@/lib/api/call-api", () => ({ callApi: (a: Record<string, unknown>) => { calls.push(a); return a; } }));
    jest.doMock("@/lib/api/adminDoor", () => ({ adminDoorOpen: () => false }));
    jest.doMock("@/features/masterwork/service", () => ({ createDraftRulebook: jest.fn() }));
    jest.doMock("@/utils/supabase/client", () => ({ supabase: {} }));
    jest.doMock("@ai-matrx/agents/matrx", () => ({ streamErrorText: () => null }));
    const { makeAgentFromChat } = await import("../../from-chat/service");
    const dispatch = (async (a: unknown) => ({ ...(a as object), error: null })) as never;
    await makeAgentFromChat(dispatch, "c".repeat(36), () => undefined, ["x", " ", "y"]);
    expect((calls[0].body as Record<string, unknown>).examples).toEqual(["x", "y"]);
    await makeAgentFromChat(dispatch, "c".repeat(36), () => undefined);
    expect((calls[1].body as Record<string, unknown>).examples).toBeUndefined();
  });
});
