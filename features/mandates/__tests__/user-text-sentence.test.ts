/**
 * V2-2 — ONE SENTENCE ABOUT FREE USER TEXT, ONE AUTHORITY.
 *
 * The defect, walked on production 2026-08-31: the same mandate, in the same
 * minute, on two screens. The admin panel: "User text: This Mandate forbids
 * user text". The user host, two clicks away: "Free text from the caller is
 * accepted (platform default)."
 *
 * Two derivations, neither of them the authority. The user host's sentence was
 * a hardcoded constant that asked nothing at all; the admin's came from
 * `code_truth.passes_user_input`, which reports what the CALLING CODE forwards
 * and is `false` for every mandate no code declares — which is every mandate a
 * person authors.
 *
 * The served input surface's `accepts_user_input` is the mandate's own answer
 * and the run door's. This guard pins the sentence to it and reads the SOURCE
 * of both hosts, because the defect was two files agreeing to disagree — a
 * test that renders one of them could never have caught it.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseMandateInputSurface,
  userTextSentence,
} from "../input-surface";

const TRIAD = join(process.cwd(), "features/mandates/workspace/TriadSections.tsx");
const ADMIN_PANEL = join(
  process.cwd(),
  "features/mandates/admin/MandateDetailPanel.tsx",
);
const SHARED = join(
  process.cwd(),
  "features/mandates/components/MandateUserTextLine.tsx",
);

describe("the user-text sentence comes from the served surface", () => {
  it("says accepted when the surface says accepted", () => {
    const surface = parseMandateInputSurface(
      { mandate_key: "zzz.scratch_job", accepts_user_input: true, inputs: [] },
      "zzz.scratch_job",
    );
    expect(userTextSentence(surface)).toContain("accepted");
    expect(userTextSentence(surface)).not.toContain("not accepted");
  });

  it("says NOT accepted when the surface says so — and never 'platform default'", () => {
    const surface = parseMandateInputSurface(
      { mandate_key: "zzz.scratch_job", accepts_user_input: false, inputs: [] },
      "zzz.scratch_job",
    );
    expect(userTextSentence(surface)).toContain("not accepted");
    // The old user-host copy asserted a default it had never read.
    expect(userTextSentence(surface)).not.toContain("platform default");
  });

  it("a missing flag is NOT read as acceptance", () => {
    const surface = parseMandateInputSurface(
      { mandate_key: "zzz.scratch_job", inputs: [] },
      "zzz.scratch_job",
    );
    expect(surface.acceptsUserInput).toBe(false);
  });
});

describe("neither host derives that sentence for itself", () => {
  const triad = readFileSync(TRIAD, "utf8");
  const admin = readFileSync(ADMIN_PANEL, "utf8");
  const shared = readFileSync(SHARED, "utf8");

  it("is reading the files it means to guard", () => {
    expect(triad).toContain("TriadInputSection");
    expect(admin).toContain("StatusBanner");
    expect(shared).toContain("userTextSentence");
  });

  it("both hosts render the one shared line", () => {
    expect(triad).toContain("MandateUserTextLine");
    expect(admin).toContain("MandateUserTextLine");
  });

  it("no host carries its own free-text claim", () => {
    for (const [name, source] of [
      ["TriadSections.tsx", triad],
      ["MandateDetailPanel.tsx", admin],
    ] as const) {
      expect(`${name}: ${source.includes("platform default)")}`).toBe(
        `${name}: false`,
      );
      expect(`${name}: ${source.includes("forbids user text")}`).toBe(
        `${name}: false`,
      );
    }
  });

  it("the admin panel does not read the mandate's answer out of code truth", () => {
    // `passes_user_input` may still be REPORTED — as a fact about the call
    // site, under its own label. It may never be the mandate's verdict.
    const verdictFromCodeTruth =
      /label="User text"[\s\S]{0,200}passes_user_input/.test(admin);
    expect(verdictFromCodeTruth).toBe(false);
  });
});
