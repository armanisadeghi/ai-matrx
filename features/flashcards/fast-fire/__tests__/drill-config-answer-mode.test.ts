// answerMode (page-pass 2026-09-27): the typed-answer drill is a real,
// agent-settable mode, validated like every other drill field.
import { DEFAULT_DRILL_CONFIG, parseDrillConfigPatch } from "../drill-config";

describe("drill_config.answerMode", () => {
  it("defaults to voice", () => {
    expect(DEFAULT_DRILL_CONFIG.answerMode).toBe("voice");
  });
  it("accepts typed and voice", () => {
    expect(parseDrillConfigPatch({ answerMode: "typed" }, DEFAULT_DRILL_CONFIG)).toEqual({
      answerMode: "typed",
    });
    expect(parseDrillConfigPatch({ answerMode: "voice" }, DEFAULT_DRILL_CONFIG)).toEqual({
      answerMode: "voice",
    });
  });
  it("refuses anything else", () => {
    expect(() =>
      parseDrillConfigPatch({ answerMode: "keyboard" }, DEFAULT_DRILL_CONFIG),
    ).toThrow(/answerMode expects "voice"/);
  });
});
