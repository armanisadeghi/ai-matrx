/**
 * THE PASTE BOX TEACHES A SHAPE THAT PARSES.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 5, finding 4, 2026-09-16).
 * Shadow-the-inbox's placeholder said: "Paste the whole thread — your reply on
 * top and the message you were answering underneath, exactly as your mail app
 * shows it." A thread in exactly that shape — two halves separated by nothing
 * but a blank line — cannot be split by anything, ever: two paragraphs of prose
 * are indistinguishable from one message of two paragraphs. The walker followed
 * the instruction literally and was told "Nothing to shadow — you never replied
 * in it", with nothing on screen naming what to change.
 *
 * THE CLASS: a door whose instruction the code behind it cannot honour. The
 * parser half is guarded in aidream
 * (`aidream/services/distillation/tests/test_the_paste_door_example_parses.py`,
 * which runs the declared example through the REAL parser). This is the copy
 * half: the words in the box must keep naming the one marker that parser keys
 * on, and must keep showing it on a line of its own.
 *
 * RED against the old placeholder: it names no marker at all.
 */

import {
  SHADOW_PASTE_MARKER_LINE,
  SHADOW_PASTE_PLACEHOLDER,
} from "../components/detail/ShadowInboxDialog";

describe("the paste box teaches a shape that parses", () => {
  it("names the marker the parser keys on", () => {
    expect(SHADOW_PASTE_MARKER_LINE).toBe("My reply:");
    expect(SHADOW_PASTE_PLACEHOLDER).toContain(SHADOW_PASTE_MARKER_LINE);
  });

  it("shows the marker on a line of its own, which is what the parser requires", () => {
    const lines = SHADOW_PASTE_PLACEHOLDER.split("\n").map((line) => line.trim());
    expect(lines).toContain(SHADOW_PASTE_MARKER_LINE);
  });

  it("shows a worked example, not only a rule — the message, the marker, the reply", () => {
    const lines = SHADOW_PASTE_PLACEHOLDER.split("\n").map((line) => line.trim());
    const at = lines.indexOf(SHADOW_PASTE_MARKER_LINE);
    expect(at).toBeGreaterThan(0);
    const before = lines.slice(0, at).filter(Boolean);
    const after = lines.slice(at + 1).filter(Boolean);
    expect(before.join(" ").length).toBeGreaterThan(80);
    expect(after.join(" ").length).toBeGreaterThan(80);
  });

  it("still tells people a real mail-app copy works, and how we recognise one", () => {
    expect(SHADOW_PASTE_PLACEHOLDER).toContain("wrote:");
    expect(SHADOW_PASTE_PLACEHOLDER).toContain("Original Message");
    expect(SHADOW_PASTE_PLACEHOLDER).toContain('">"');
  });

  it("never again promises that a bare 'reply on top, message underneath' paste works", () => {
    expect(SHADOW_PASTE_PLACEHOLDER).not.toContain(
      "your reply on top and the message you were answering underneath",
    );
  });
});
