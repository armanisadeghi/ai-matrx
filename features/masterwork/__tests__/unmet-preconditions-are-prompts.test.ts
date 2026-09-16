/**
 * 🚨 "YOU HAVE NOT FILLED THIS IN YET" IS A PROMPT, NEVER AN ALARM.
 *
 * THE LIVE DEFECT (cold walk of Masterwork, 2026-09-16). On the Bad Example
 * probe a first-time Expert pressed "Write the first one" with the job
 * description still empty and got a destructive-red validation banner. An
 * earlier lane had already fixed ONE sentence on step 1 of `/masterwork/new`
 * and declared the class closed; it was half closed, and the red banner two
 * screens away was still teaching a non-technical person to fear the screen.
 *
 * THE RULE. Destructive red is reserved for something that went WRONG or
 * something that will destroy or spend. A person who simply has not typed yet
 * is not in an error state: the control is gated, and the reason is rendered
 * beside it in muted chrome as a next step — the `GatedActionButton` contract.
 *
 * THE GUARD IS A CLASS CENSUS, not a snapshot of one component. Three rules,
 * each of which fails on a NEW member written anywhere under
 * `features/masterwork/**` or `features/vision-interview/**`:
 *
 *   R1 — a `toast.error("… first.")`: a red toast whose words are an
 *        instruction for something not done YET.
 *   R2 — a `toast.error(refusal)` where `refusal` came from a precondition
 *        validator (a `…): string | null` that answers "what is missing").
 *   R3 — a destructive-chrome element rendering such a validator's sentence,
 *        or an instruction written straight into red chrome.
 *
 * HOW TO SEE IT RED. Put the pre-fix banner back in
 * `features/masterwork/probe/BadExampleProbe.tsx` (`setRefusal(problem)` plus
 * the `border-destructive/40 … text-destructive` `<p>{refusal}</p>`) and R3
 * fails naming that file. Each rule also carries its own fixture below, and
 * each fixture is written so that ONLY its own rule can catch it — delete a
 * rule from the scanner and exactly that self-test goes red.
 *
 * THE ALLOW-LIST is reasoned, per entry, and never a silence: an entry says
 * WHY red is the honest colour there (a real failure, a real destruction), or
 * that the file belongs to another lane right now and the member is filed.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  censusPreconditionChrome,
  isPreconditionPrompt,
  type PreconditionViolation,
} from "./preconditionChromeCensus";

const REPO = path.resolve(__dirname, "..", "..", "..");
const ROOTS = [
  path.join(REPO, "features", "masterwork"),
  path.join(REPO, "features", "vision-interview"),
];

/**
 * Every entry is a judgement, not a silence. `file` + `sentence` must both
 * match, so moving the code or changing the words re-opens the question.
 */
interface Allowed {
  file: string;
  sentence: string;
  why: string;
}

const ALLOW_LIST: ReadonlyArray<Allowed> = [
  {
    file: "features/masterwork/build/BuildWindow.tsx",
    sentence: "Name this Masterwork first.",
    why:
      "UNREACHABLE BACKSTOP, in a file another lane owns today (2026-09-16): " +
      "`features/masterwork/build/**`. The Build button is already a " +
      "GatedActionButton carrying \"Name your Masterwork to build it\", so " +
      "this toast cannot fire — but the next owner of that file should turn " +
      "it into a plain early return the way the rest of this sweep did, and " +
      "delete this entry.",
  },
  {
    file: "features/vision-interview/hooks/useInterviewRun.ts",
    sentence: "There is no active run to answer — start the interview first.",
    why:
      "A GENUINE FAILURE, and red is the honest colour. The person has typed " +
      "an answer and pressed send; there is no run to deliver it to, so " +
      "something is WRONG rather than not-yet-done. Flattening this to a " +
      "muted prompt would hide a real loss.",
  },
  {
    file: "features/masterwork/components/masterworks/UnfoldingAuditionPanel.tsx",
    sentence: "Pick at most ${max}.",
    why:
      "A REFUSAL OF SOMETHING DONE, not a precondition. The person has just " +
      "clicked one Masterwork too many and the click is being refused — an " +
      "action that did not take effect, which is exactly what red is for. " +
      "The not-yet-picked cases on this same panel are gated on the button " +
      "instead (`missingPicks`).",
  },
  {
    file: "features/masterwork/encore/RunTheBench.tsx",
    sentence:
      "Write the task first — every arm gets this same wording, so it has to stand on its own.",
    why:
      "KNOWN OPEN MEMBER, not an exoneration. This is the same defect as the " +
      "probe's banner and it needs the same GatedActionButton fix. " +
      "`features/masterwork/encore/**` is owned by another lane as this " +
      "census is written (2026-09-16), so it is named here rather than " +
      "edited underneath them. Whoever next owns encore: delete this entry " +
      "and gate the 'Run the trial' button on `taskPrompt`.",
  },
];

function isAllowed(v: PreconditionViolation): Allowed | undefined {
  return ALLOW_LIST.find(
    (a) => a.file === v.file && a.sentence.trim() === v.sentence.trim(),
  );
}

describe("the grammar of a prompt", () => {
  // The lexicon must separate the two kinds of sentence — otherwise the
  // census either misses the class or flattens real errors.
  it.each([
    "Say something first — a sentence is plenty.",
    "Attach at least one source first.",
    "Add a short name and the rule itself before cleaning it up.",
    "A rule needs at least a short name and the rule itself.",
  ])("counts %p as a prompt", (sentence) => {
    expect(isPreconditionPrompt(sentence)).toBe(true);
  });

  it.each([
    "We couldn't record your sign-off. Nothing else was lost.",
    "This trial proves nothing — the expert's own withheld answer did not win.",
    "Your rulebook changed while you were answering — reopen and try again.",
    "permission denied for table \"rulebook\"",
  ])("leaves %p alone", (sentence) => {
    expect(isPreconditionPrompt(sentence)).toBe(false);
  });
});

describe("the census itself", () => {
  let dir: string;
  const write = (rel: string, body: string) => {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "precondition-census-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Each fixture below carries EXACTLY the shape of one rule and nothing the
  // other two rules could latch onto — so `rules` is the proof that the named
  // rule fired, and deleting that rule from the scanner turns this red.
  it("R1 — catches a red toast that is really an instruction", () => {
    write(
      "surface/Thing.tsx",
      [
        'import { toast } from "@/lib/toast";',
        "export function Thing() {",
        "  const send = () => {",
        '    toast.error("Pick a rulebook first.");',
        "  };",
        "  return send;",
        "}",
      ].join("\n"),
    );
    const found = censusPreconditionChrome([dir], dir);
    expect(found.map((v) => v.rule)).toEqual(["R1-toast-literal"]);
    expect(found[0].sentence).toBe("Pick a rulebook first.");
  });

  it("R2 — catches a validator's sentence thrown as a red toast", () => {
    write(
      "surface/validate.ts",
      [
        "export function validateThing(input: string): string | null {",
        '  if (!input.trim()) return "Name it before you save it";',
        "  return null;",
        "}",
      ].join("\n"),
    );
    write(
      "surface/Caller.tsx",
      [
        'import { toast } from "@/lib/toast";',
        'import { validateThing } from "./validate";',
        "export function Caller({ value }: { value: string }) {",
        "  const save = () => {",
        "    const stopper = validateThing(value);",
        "    if (stopper) {",
        "      toast.error(stopper);",
        "      return;",
        "    }",
        "  };",
        "  return save;",
        "}",
      ].join("\n"),
    );
    const found = censusPreconditionChrome([dir], dir);
    expect(found.map((v) => v.rule)).toEqual(["R2-toast-validator"]);
    expect(found[0].file).toBe(path.join("surface", "Caller.tsx"));
  });

  it("R3 — catches a validator's sentence painted in destructive chrome", () => {
    // This is the pre-fix Bad Example probe, reduced to its bones: the
    // sentence lives in another module, reaches the component through a
    // setter, and is rendered inside red chrome.
    write(
      "probe/service.ts",
      [
        "export function validateBrief(brief: string): string | null {",
        '  if (!brief.trim()) return "Say what kind of work to fake first";',
        "  return null;",
        "}",
      ].join("\n"),
    );
    write(
      "probe/Probe.tsx",
      [
        'import { useState } from "react";',
        'import { validateBrief } from "./service";',
        "export function Probe({ brief }: { brief: string }) {",
        "  const [refusal, setRefusal] = useState<string | null>(null);",
        "  const send = () => {",
        "    const problem = validateBrief(brief);",
        "    setRefusal(problem);",
        "  };",
        "  return (",
        "    <div onClick={send}>",
        "      {refusal ? (",
        '        <p className="border border-destructive/40 text-destructive">',
        "          {refusal}",
        "        </p>",
        "      ) : null}",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
    );
    const found = censusPreconditionChrome([dir], dir);
    expect(found.map((v) => v.rule)).toEqual(["R3-destructive-banner"]);
    expect(found[0].file).toBe(path.join("probe", "Probe.tsx"));
  });

  it("says nothing about a genuine failure banner or a destructive confirm", () => {
    write(
      "surface/Honest.tsx",
      [
        'import { toast } from "@/lib/toast";',
        "export function Honest({ error }: { error: string | null }) {",
        "  const remove = () => {",
        '    toast.error("Could not delete that source.");',
        "  };",
        "  return (",
        "    <div>",
        "      {error ? (",
        '        <p className="border border-destructive/40 text-destructive">',
        "          {error}",
        "        </p>",
        "      ) : null}",
        '      <button className="bg-destructive" onClick={remove}>',
        "        Delete it",
        "      </button>",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
    );
    expect(censusPreconditionChrome([dir], dir)).toEqual([]);
  });
});

describe("the live feature", () => {
  it("renders no unmet precondition in destructive chrome", () => {
    const found = censusPreconditionChrome(ROOTS, REPO);
    const unexplained = found.filter((v) => !isAllowed(v));
    expect(
      unexplained.map((v) => `${v.file} [${v.rule}] ${v.sentence} — ${v.detail}`),
    ).toEqual([]);
  });

  it("keeps the allow-list honest — every entry still describes a real site", () => {
    const found = censusPreconditionChrome(ROOTS, REPO);
    const stale = ALLOW_LIST.filter(
      (a) => !found.some((v) => v.file === a.file && v.sentence.trim() === a.sentence.trim()),
    );
    // An allow-list entry that no longer matches anything is a licence nobody
    // needs: delete it, so the next real member cannot hide behind it.
    expect(stale.map((a) => `${a.file} — ${a.sentence}`)).toEqual([]);
  });
});
