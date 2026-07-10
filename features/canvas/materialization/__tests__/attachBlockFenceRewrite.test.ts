import {
  messageStillHasFence,
  rewriteAllMatchingFences,
} from "@/features/canvas/materialization/attachBlockFenceRewrite";

const BODY = "console.log(1)";
const FENCE = "```ts\n" + BODY + "\n```";
const WIRE =
  '<artifact type="code" id="a1b2c3d4-e5f6-7890-abcd-ef1234567890" version="1">' +
  BODY +
  "</artifact>";

describe("attachBlockFenceRewrite", () => {
  it("rewrites every identical fence to the same artifact wire", () => {
    const content = [
      {
        type: "text",
        text: `First:\n\n${FENCE}\n\nSecond:\n\n${FENCE}\n`,
      },
    ];
    const out = rewriteAllMatchingFences(content, "ts", BODY, WIRE, FENCE);
    expect(out).not.toBeNull();
    const text = out![0]!.text!;
    expect(text.split(WIRE).length - 1).toBe(2);
    expect(text.includes(FENCE)).toBe(false);
    expect(messageStillHasFence(out!, "ts", BODY, FENCE)).toBe(false);
  });

  it("returns null when the fence is absent", () => {
    const content = [{ type: "text", text: "no code here" }];
    expect(
      rewriteAllMatchingFences(content, "ts", BODY, WIRE, FENCE),
    ).toBeNull();
  });

  it("detects remaining raw fences after a partial rewrite", () => {
    const content = [
      {
        type: "text",
        text: `${WIRE}\n\n${FENCE}`,
      },
    ];
    expect(messageStillHasFence(content, "ts", BODY, FENCE)).toBe(true);
  });
});
