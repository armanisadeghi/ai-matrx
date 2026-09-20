/**
 * COLD WALK 12, D8 — "Untitled" IS NOT A NAME.
 *
 * On the Rulebook home an Expert read "1 source is already here" →
 * "Untitled — 513 words", three minutes after creating the Rulebook and having
 * attached nothing. Verified with read-only SQL on her Rulebook
 * a18eb3de-ebb7-4e02-895e-c4ab534aa24f: nothing foreign and no scope leak —
 * all eight rows are hers, and the list query is already filtered by
 * `rulebook_id`. The nameless row was her OWN interview.
 *
 * The server half (a kept interview takes the conversation's own name) is
 * guarded in aidream,
 * `aidream/services/distillation/tests/test_a_kept_interview_is_never_nameless.py`.
 * This is the other half, and it holds for every source the server could still
 * hand us without a name, from any lane, forever: a source with no label says
 * WHAT IT IS and WHEN IT ARRIVED — both always known — instead of a word that
 * tells a non-technical Expert nothing and reads like a stranger's file.
 *
 * Two surfaces render a kept source's name (the Sources block on the Rulebook
 * home and the Kept-material list/reader). They had two different fallbacks,
 * "Untitled" and "Untitled source". There is now ONE function, and this file
 * also proves neither surface can drift back to its own.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { keptSourceTitle } from "../types";

// Noon UTC, so "Sep 19" is the day in EVERY timezone a runner can be in. The
// real capture (2026-09-20T03:52Z) read Sep 19 on the author's Pacific clock
// and Sep 20 on CI's UTC clock — a test about the day must not depend on
// where it runs.
const CAPTURED = "2026-09-19T12:00:00.000Z";
/** A clock in the same year, so the short form is the one under test. */
const NOW = new Date("2026-09-25T10:00:00Z");

describe("a kept source with no name of its own", () => {
  it("never renders the word Untitled", () => {
    const title = keptSourceTitle(
      { label: null, medium: "turns", captured_at: CAPTURED },
      NOW,
    );
    expect(title.toLowerCase()).not.toContain("untitled");
  });

  it("says what it IS and WHEN it arrived", () => {
    expect(
      keptSourceTitle(
        { label: null, medium: "turns", captured_at: CAPTURED },
        NOW,
      ),
    ).toBe("Conversation you added on Sep 19");
  });

  it("names each medium in words a non-technical Expert reads", () => {
    const of = (medium: string) =>
      keptSourceTitle({ label: null, medium, captured_at: CAPTURED }, NOW);
    expect(of("turns")).toContain("Conversation");
    expect(of("exchange")).toContain("Messages");
    expect(of("document")).toContain("Document");
    expect(of("text")).toContain("Pasted text");
    // A medium the server adds later must degrade to a true word, never blank
    // and never the raw token.
    expect(of("hologram")).toContain("Source");
    expect(of("hologram")).not.toContain("hologram");
  });

  it("carries the year when the source is not from this year", () => {
    const title = keptSourceTitle(
      { label: null, medium: "document", captured_at: "2024-03-04T00:00:00Z" },
      NOW,
    );
    expect(title).toContain("2024");
  });

  it("still refuses to invent when even the date is unknown", () => {
    const title = keptSourceTitle(
      { label: null, medium: "document", captured_at: null },
      NOW,
    );
    expect(title).toBe("Document you added");
    expect(title.toLowerCase()).not.toContain("untitled");
  });

  it("leaves a real name, and a URL, exactly alone", () => {
    expect(
      keptSourceTitle(
        {
          label: "Pressure-Drop Diagnosis for Autumn Browning",
          medium: "turns",
          captured_at: CAPTURED,
        },
        NOW,
      ),
    ).toBe("Pressure-Drop Diagnosis for Autumn Browning");
    expect(
      keptSourceTitle(
        {
          label: "   ",
          url: "https://example.com/audit",
          medium: "text",
          captured_at: CAPTURED,
        },
        NOW,
      ),
    ).toBe("https://example.com/audit");
  });
});

describe("neither surface keeps a fallback of its own", () => {
  const read = (rel: string) =>
    readFileSync(path.join(process.cwd(), rel), "utf8");

  it("the Rulebook home's Sources block names rows through the one function", () => {
    const src = read(
      "features/masterwork/components/detail/RulebookSourcesPanel.tsx",
    );
    expect(src).toContain("keptSourceTitle(row)");
    expect(src).not.toContain('row.label || "Untitled"');
  });

  it("no kept-source surface hand-writes an Untitled fallback", () => {
    for (const file of [
      "features/masterwork/kept-sources/types.ts",
      "features/masterwork/kept-sources/columns.tsx",
      "features/masterwork/kept-sources/listConfig.tsx",
      "features/masterwork/kept-sources/KeptSourceReader.tsx",
      "features/masterwork/components/detail/RulebookSourcesPanel.tsx",
    ]) {
      const body = read(file)
        // The law is explained in prose in types.ts; only CODE is judged.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect({ file, hit: /["'`]Untitled/i.test(body) }).toEqual({
        file,
        hit: false,
      });
    }
  });

  it("the brief row the Sources block renders carries the date it needs", () => {
    const service = read("features/masterwork/kept-sources/service.ts");
    expect(service).toContain(
      '"source_key,label,medium,approach_key,word_count,captured_at"',
    );
  });
});
