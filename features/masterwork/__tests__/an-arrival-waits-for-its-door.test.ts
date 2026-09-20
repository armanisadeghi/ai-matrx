/**
 * AN ARRIVAL IS HELD UNTIL THE SURFACE IT OPENS CAN EXIST. A forcing function.
 *
 * ## What it exists to stop happening again
 *
 * Cold walk 13, 2026-09-20 (Friction): *"The interview did not open when Start
 * sent me to it. Start navigated to `/masterwork/<id>?interview=1` and left me
 * on the Rulebook home with no panel for 25 seconds; a manual reload of the
 * identical URL opened it. Deep-link arrival and reload behave differently."*
 *
 * ## The root cause, and why it is a CLASS
 *
 * `useDeepLinkArrival(asking, ready, onArrive)` takes `ready` — "may we act
 * yet" — precisely so an arrival can be HELD rather than dropped while the
 * record it needs has not loaded. It fires exactly once per arrival and
 * latches itself handled, so an arrival spent into a page that cannot yet show
 * anything is spent for good.
 *
 * On the Rulebook page, eleven of the fifteen deep links passed the real
 * answer (`Boolean(rulebook?.id)`). FIVE passed a bare `true` — interview,
 * conduct, meeting, body_of_work, chatImport — and the interview was the worst
 * of them, because `<ScoutInterviewPanel>` is additionally rendered only when
 * `canEdit` is true, which cannot happen until the Rulebook row has loaded AND
 * the viewer has been resolved. The arrival therefore fired on MOUNT, into a
 * page with no door.
 *
 * A reload and a client-side arrival differ in exactly one respect that
 * matters here: what has already settled when the component first mounts. Any
 * arrival wired to a constant `true` is that asymmetry waiting to be found,
 * which is why this guard is a CENSUS of the page rather than a reproduction
 * of the one link the walk happened to press.
 *
 * The primitive's own held-arrival behaviour is proven in
 * `lib/deep-link/useDeepLinkArrival.test.tsx` ("holds the arrival until the
 * record it needs has loaded, never drops it"); this file proves the page
 * actually USES it.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE = fs.readFileSync(
  path.join(
    process.cwd(),
    "features/masterwork/components/detail/RulebookDetailPage.tsx",
  ),
  "utf8",
);

/** Every `useDeepLinkArrival(...)` call's SECOND argument, in source order. */
function readinessArguments(source: string): string[] {
  const out: string[] = [];
  const marker = "useDeepLinkArrival(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return out;
    from = at + marker.length;
    // Walk the call's arguments, tracking nesting so a `Boolean(rulebook?.id)`
    // or an arrow body never looks like an argument separator.
    let depth = 0;
    let arg = "";
    const args: string[] = [];
    for (let i = from; i < source.length; i += 1) {
      const c = source[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (c === ")" && depth === 0) {
          args.push(arg);
          break;
        }
        depth -= 1;
      }
      if (c === "," && depth === 0) {
        args.push(arg);
        arg = "";
        continue;
      }
      arg += c;
    }
    if (args.length >= 2) out.push(args[1].trim());
  }
}

describe("every deep link on the Rulebook page waits for what it opens", () => {
  const readiness = readinessArguments(SOURCE);

  it("finds every arrival on the page", () => {
    // If this drops to a handful the parser has broken, not the page.
    expect(readiness.length).toBeGreaterThanOrEqual(15);
  });

  it("never spends an arrival on a constant true", () => {
    const bare = readiness.filter((r) => r === "true");
    expect(bare).toEqual([]);
  });

  it("holds the interview until its panel can exist, not merely until the Rulebook loads", () => {
    // `<ScoutInterviewPanel>` is rendered `{canEdit ? … : null}`, so the record
    // loading is NOT enough: the door itself must exist, or the arrival is
    // spent into nothing. This is the walk-13 defect exactly.
    const interview = SOURCE.slice(
      SOURCE.indexOf('useDeepLinkArrival(searchParams.get("interview")'),
    ).slice(0, 220);
    expect(interview).toContain("canEdit");
    expect(interview).not.toContain('=== "1", true');
  });

  it("still renders the interview panel only where canEdit is true", () => {
    // The readiness above is only honest while this is the door's condition;
    // if the gate moves, the arrival's `ready` has to move with it.
    expect(SOURCE).toContain("{canEdit ? (\n            <ScoutInterviewPanel");
  });
});
