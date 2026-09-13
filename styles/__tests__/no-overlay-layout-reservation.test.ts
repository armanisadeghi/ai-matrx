/**
 * THE LAW THIS GUARDS (2026-09-13): a global fixed notice must not hide the
 * last actionable content. The schedule singleton publishes compact/expanded
 * presence and the actual shell scroll owner reserves responsive runway. This
 * must remain state-driven rather than a measured height feedback loop.
 *
 * Static assertion over the CSS source: jsdom cannot evaluate these stylesheets.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Strip comments so the explanatory prose above these rules can't match. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const SHELL_CSS = stripComments(
  readFileSync(join(__dirname, "..", "shell.css"), "utf8"),
);
const BANNER_TSX = stripComments(
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "features/scheduling/components/alarm/SystemScheduleAlarmBanner.tsx",
    ),
    "utf8",
  ),
);

describe("global fixed alerts preserve reachable page actions", () => {
  it("reserves responsive runway on the shared shell scroll owner", () => {
    expect(SHELL_CSS).toContain(":root[data-schedule-alarm=\"compact\"]");
    expect(SHELL_CSS).toContain(":root[data-schedule-alarm=\"expanded\"]");
    expect(SHELL_CSS).toContain("padding-bottom: var(--shell-fixed-alert-clearance)");
    expect(SHELL_CSS).toContain("36dvh");
    expect(SHELL_CSS).toContain("@media (min-width: 640px)");
  });

  it("the alarm publishes semantic state, not a measured height", () => {
    expect(BANNER_TSX).toContain("root.dataset.scheduleAlarm");
    expect(BANNER_TSX).not.toContain("ResizeObserver");
    expect(BANNER_TSX).not.toContain("getBoundingClientRect");
  });

  it("the alarm and shared toasts have separate bottom slots", () => {
    expect(BANNER_TSX).toContain("useDraggableFloat");
    expect(BANNER_TSX).toContain("SNOOZE_CHOICES");
    expect(BANNER_TSX).toContain("DEFAULT_SNOOZE");
    const toast = readFileSync(join(__dirname, "..", "..", "components", "ui", "toast.tsx"), "utf8");
    expect(toast).toContain("bottom-[var(--shell-fixed-alert-clearance,0px)]");
  });
});
