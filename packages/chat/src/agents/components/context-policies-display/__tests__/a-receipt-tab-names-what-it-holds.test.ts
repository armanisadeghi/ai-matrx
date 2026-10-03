/**
 * A sent message's receipt tab names what it holds and how many: "Sent values · 5".
 * It used to reuse the pill's text and read "Sent · 5 sent · 1 off" in the tab
 * strip — the word twice, nothing saying what was sent (2026-10-03).
 */
import { receiptTabTitle } from "../MessageContextReceipt";

type Receipt = Parameters<typeof receiptTabTitle>[0];

const row = (delivery: string) => ({ delivery }) as unknown as NonNullable<Receipt["rows"]>[number];

describe("receiptTabTitle", () => {
  it("counts only the values that rode the turn", () => {
    const receipt = { rows: [row("inline"), row("inline"), row("off")] } as unknown as Receipt;
    expect(receiptTabTitle(receipt)).toBe("Sent values · 2");
  });

  it("never repeats the word 'sent' or carries the pill's 'off' tally", () => {
    const title = receiptTabTitle({ rows: [row("off"), row("inline")] } as unknown as Receipt);
    expect(title.match(/sent/gi)?.length).toBe(1);
    expect(title).not.toMatch(/off/);
  });
});
