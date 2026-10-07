import { parseDelimited } from "@ai-matrx/alchemy/operate/read";
import { punchRegisterToCsv } from "../registerCsv";
import { rowsToCsv } from "@ai-matrx/chat/agent-copy/export";
import { listingToCsv } from "@/features/product-capture/components/pipeline/ListingPanel";

const NASTY = 'He said "hi", then\nleft';

describe("hand-rolled CSV writers now ride Alchemy's one writer", () => {
  it("rowsToCsv round-trips a quote + comma + newline cell", () => {
    const csv = rowsToCsv([{ a: NASTY, b: "plain" }]);
    const parsed = parseDelimited(csv, { header: true });
    expect(parsed.data).toEqual([{ a: NASTY, b: "plain" }]);
  });

  it("punch register round-trips a quote + comma + newline reason", () => {
    const punch = {
      id: "p1",
      employmentId: "e1",
      localWorkDate: "2026-10-01",
      occurredAt: "2026-10-01T15:00:00Z",
      tz: "America/Los_Angeles",
      punchKind: "in",
      source: "web",
      actorType: "employee",
      enteredReason: NASTY,
    } as never;
    const csv = punchRegisterToCsv([punch], { e1: "Ada" });
    const parsed = parseDelimited(csv, { header: true });
    expect(parsed.data[0]["Entered reason"]).toBe(NASTY);
  });

  it("listing CSV round-trips a quote + comma + newline description", () => {
    const csv = listingToCsv({ code: "S1" } as never, { description: NASTY });
    const parsed = parseDelimited(csv, { header: true });
    expect(parsed.data[0].description).toBe(NASTY);
  });
});
