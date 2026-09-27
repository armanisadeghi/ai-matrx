/**
 * Action items → Tasks (Meet wave 3): the provenance a task carries is what
 * makes the link back AND the duplicate guard. A change to the dedupe key
 * shape would let "Create all" after one-by-one creation make a second copy of
 * every task (the unique index is on (organization, dedupe_key)).
 */
import {
  dedupeKeyFor,
  MEET_NOTE_SOURCE,
  taskDescriptionFor,
  taskTitleFor,
} from "./useActionItemTasks";

describe("action item → task provenance", () => {
  it("one action item, one dedupe key, stable across calls", () => {
    expect(MEET_NOTE_SOURCE).toBe("meet_note");
    expect(dedupeKeyFor("0b6c")).toBe("meet_note:0b6c");
    expect(dedupeKeyFor("0b6c")).toBe(dedupeKeyFor("0b6c"));
  });

  it("the title is the action item, whitespace collapsed, capped for a task list", () => {
    expect(taskTitleFor("  Send the   revised quote\nby Friday ")).toBe(
      "Send the revised quote by Friday",
    );
    const long = "x".repeat(260);
    expect(taskTitleFor(long)).toHaveLength(198);
    expect(taskTitleFor(long).endsWith("…")).toBe(true);
  });

  it("the description names the meeting and the owner the meeting named, and keeps a long item whole", () => {
    const short = taskDescriptionFor({
      meetingTitle: "Q4 renewal with Acme",
      when: "Sat, Sep 12, 12:36 PM",
      ownerName: "Grace Hopper",
      text: "Take the Tangerine account.",
    });
    expect(short).toBe(
      "From the meeting “Q4 renewal with Acme” (Sat, Sep 12, 12:36 PM).\nOwner named in the meeting: Grace Hopper.",
    );
    const long = taskDescriptionFor({ meetingTitle: "M", when: "w", ownerName: null, text: "y".repeat(250) });
    expect(long).toContain("y".repeat(250));
    expect(long).not.toContain("Owner named");
  });
});
