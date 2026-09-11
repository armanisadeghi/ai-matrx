/**
 * PROVENANCE & USAGE — the rules the panel reads by, pinned.
 *
 * 🚨 THE DEFECT (2026-09-11). Three Mandates wore "Holder missing" —
 * `shortcut.full_prompt_optimizer`, `shortcut.simple_system_message_generator`
 * and `patrol.purpose_canary_20260829225707` — and the page could say only THAT
 * they were broken. Where they came from, whether a person is offered them
 * anywhere, and whether anything had ever run them all lived in the database,
 * reachable only by an engineer. The owner's words: "I don't want to fix these
 * until something tells me inside of the system exactly what random unknown
 * mandates like this are from and where they're used."
 *
 * These pin the ways the new row set could go back to lying:
 *   · "never ran" and "could not be counted" must never render the same
 *   · a count of 1 is "Once", not "1 times"
 *   · a migrated Mandate is never labelled as a person's work
 *   · the panel prints the SERVER's sentences, so this file exercises the
 *     reading it does derive (`runsReading`) and nothing it does not
 */
import {
  ORIGIN_LABELS,
  PROVENANCE_SECTION_TITLE,
  runsReading,
  type MandateUsageFacts,
} from "@/features/mandates/provenance";

function usage(patch: Partial<MandateUsageFacts>): MandateUsageFacts {
  return {
    conversation_count: 0,
    request_count: 0,
    first_run_at: null,
    last_run_at: null,
    runs_href: "/work/conversations?filters=%7B%7D&archived=all",
    observed_attempted: null,
    observed_resolved: null,
    observed_executed: null,
    observed_last_at: null,
    code_reference_count: 0,
    sentence: "server sentence",
    ...patch,
  } satisfies MandateUsageFacts;
}

describe("runsReading", () => {
  it("NEVER reads an unreadable ledger as 'never ran'", () => {
    const unknown = runsReading(
      usage({ conversation_count: null, request_count: null }),
    );
    const never = runsReading(usage({}));
    expect(unknown.kind).toBe("unknown");
    expect(never.kind).toBe("never");
    // The two facts are opposite and a person acts differently on each.
    expect(unknown.text).not.toBe(never.text);
    expect(unknown.text).toContain("not the same as never");
  });

  it("says Never only when BOTH ledgers agree nothing ran", () => {
    expect(runsReading(usage({})).kind).toBe("never");
    // A request ledger that saw runs outranks an empty conversation count —
    // reading "never" there would hide real usage, and rendering "0 times"
    // would be worse still.
    const onlyRequests = runsReading(
      usage({ conversation_count: 0, request_count: 5 }),
    );
    expect(onlyRequests.kind).toBe("ran");
    expect(onlyRequests.text).toContain("5 times");
    expect(onlyRequests.text).not.toContain("0 times");
  });

  it("counts one run as Once, not '1 times'", () => {
    const reading = runsReading(
      usage({ conversation_count: 1, request_count: 1 }),
    );
    expect(reading.kind).toBe("ran");
    expect(reading.text).toContain("Once");
    expect(reading.text).not.toContain("1 times");
  });

  it("names the day of the last run when there is one", () => {
    const reading = runsReading(
      usage({
        conversation_count: 42,
        request_count: 61,
        last_run_at: "2026-09-10T19:00:56.211050+00:00",
      }),
    );
    // 61 requests, 42 conversations: the finer ledger wins, so the number on
    // the row can never understate what actually ran.
    expect(reading.text).toContain("61 times");
    expect(reading.text).toContain("2026-09-10");
    // A timestamp is not a sentence a person says out loud.
    expect(reading.text).not.toContain("T19:00");
  });

  it("carries the count so a caller can decide whether a link has anything behind it", () => {
    const reading = runsReading(
      usage({ conversation_count: 3, request_count: 3 }),
    );
    if (reading.kind !== "ran") throw new Error("unreachable");
    expect(reading.count).toBe(3);
  });
});

describe("origin labels", () => {
  it("never calls a migrated Mandate a person's work", () => {
    // 207 shortcut Mandates carry origin='user' and were written by the Phase
    // 6.6 migration; labelling them "Created by a person" sends a reader
    // looking for an author who was not there that day.
    expect(ORIGIN_LABELS.migration).toBe("Migrated from an older table");
    expect(ORIGIN_LABELS.migration).not.toBe(ORIGIN_LABELS.user);
  });

  it("has a word for every origin the server can return", () => {
    expect(Object.keys(ORIGIN_LABELS).sort()).toEqual([
      "code",
      "migration",
      "unknown",
      "user",
    ]);
    for (const label of Object.values(ORIGIN_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it("names the section with the platform's own words", () => {
    expect(PROVENANCE_SECTION_TITLE).toBe("Provenance & usage");
  });
});
