/**
 * THE RED TWIN of `create-manually-is-blank.test.ts`.
 *
 * It runs the SAME contract against `TEMPLATE_DATA` — what "Create Manually"
 * actually handed a person before this lane — and MUST FAIL. If this file ever
 * goes green, the shopping demo has become blank and the green suite is
 * asserting nothing. Run by name; `jest.config.ts` keeps `*.red.test.ts` out of
 * `pnpm test` on purpose.
 */
import { TEMPLATE_DATA } from "@/features/agents/constants/local-agent-templates";

function messageText(seed: typeof TEMPLATE_DATA): string {
  return (seed.messages ?? [])
    .flatMap((message) =>
      (message.content as unknown as { text?: string }[]).map(
        (block) => block.text ?? "",
      ),
    )
    .join("")
    .trim();
}

describe("the demo template is not a blank agent (this suite must fail)", () => {
  it("carries no sample instruction or user turn", () => {
    expect(messageText(TEMPLATE_DATA)).toBe("");
  });

  it("carries no sample variables", () => {
    expect(TEMPLATE_DATA.variableDefinitions).toEqual([]);
  });

  it("is not named after a template", () => {
    expect(TEMPLATE_DATA.name).not.toMatch(/template/i);
  });

  /**
   * THE CONTROL, green on purpose: a wholly red file cannot pass itself off as
   * proof that the twin is wired to the real constant.
   */
  it("is the constant the template path still uses", () => {
    expect(TEMPLATE_DATA.agentType).toBe("user");
  });
});
