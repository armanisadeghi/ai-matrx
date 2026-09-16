/**
 * THE LAW THIS GUARDS (2026-09-14): the shell's floating bottom-left chrome
 * must not cover a page's last line, and a page must not guess how much room
 * to leave it.
 *
 * Twice a guessed padding was shipped and twice it was wrong at the next
 * viewport: `lg:pb-14` on the Question Desk rail cleared the "J / K" legend
 * line (verifier finding 6, 2026-09-12) and still left the Error Inspector
 * chip sitting on "Answers save straight to the record." at 1440x900 (V2
 * finding 7, 2026-09-14). The chip's height AND its offset both change — with
 * the breakpoint (`bottom-24` on phones, `bottom-4` from `sm`) and with its own
 * contents (a counted pill, or a 20px dot) — so the only honest number is the
 * one the chrome itself measures and publishes.
 *
 * Measuring is safe HERE and not for the schedule alarm: this badge is
 * fixed-position and sized by its own contents, so nothing a consumer does with
 * the variable can change it, while the alarm's card is draggable and can be
 * viewport-tall. That asymmetry is the reason the two rules differ, and
 * `no-overlay-layout-reservation.test.ts` guards the other half.
 *
 * Static assertion over source: jsdom evaluates neither Tailwind nor a
 * fixed-position layout, and what must stay true is a property of the files —
 * the chrome publishes, the page consumes, nobody guesses.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

const VAR = "--shell-fixed-corner-clearance";

describe("the shell's bottom-left chrome publishes what it occupies", () => {
  it("the variable is declared on the shell root with a zero default", () => {
    const css = read("styles", "shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toContain(`${VAR}: 0px;`);
  });

  it("the Error Inspector badge measures its own box and publishes it", () => {
    const hook = read(
      "features",
      "admin",
      "error-inspector",
      "useFixedCornerClearance.ts",
    );
    expect(hook).toContain("getBoundingClientRect");
    expect(hook).toContain("ResizeObserver");
    expect(hook).toContain("window.innerHeight");
    expect(hook).toContain(`setProperty(FIXED_CORNER_CLEARANCE_VAR`);
    // Gone from the screen means gone from the reservation.
    expect(hook).toContain("removeProperty(FIXED_CORNER_CLEARANCE_VAR)");

    const badge = read(
      "features",
      "admin",
      "error-inspector",
      "ErrorInspectorBadge.tsx",
    );
    expect(badge).toContain("useFixedCornerClearance");
    // BOTH shapes the badge takes must carry the ref, or the pill's clearance
    // survives into the dot's smaller footprint and the page over-reserves.
    expect(badge.match(/ref=\{cornerRef\}/g) ?? []).toHaveLength(2);
  });

  it("the Question Desk rail ENDS above the measured band, never a guess", () => {
    const rail = read(
      "features",
      "question-desk",
      "components",
      "QuestionDeskRail.tsx",
    );
    const railCode = rail.replace(/\/\*[\s\S]*?\*\//g, "");
    // The rail is a scroll container: a padding at the END of its content
    // cannot protect a line that is mid-scroll under the chip (V3 2026-09-16,
    // 1280×720). Its HEIGHT stops above the band instead — via the stylesheet
    // class, never a guessed Tailwind height and never the guessed padding.
    expect(railCode).toContain("qd-rail");
    expect(railCode).not.toContain("lg:h-dvh");
    expect(railCode).not.toContain("paddingBottom");
    expect(railCode).not.toContain("lg:pb-14");
    const css = read("features", "question-desk", "question-desk.css").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(css).toMatch(
      new RegExp(`\\.qd-rail\\s*\\{[^}]*calc\\(100dvh - var\\(${VAR}, 0px\\)\\)`),
    );
  });
});
