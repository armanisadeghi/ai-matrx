/**
 * 🚨 NO DISCLOSURE SURFACE RENDERS A MANDATE KEY AS A WORD.
 *
 * THE CLASS, not the instance. Cold walk 20 (2026-09-22, production v0.4.2135
 * and v0.4.2139) read `masterwork.understudy` off the Rulebook on every load
 * and `masterwork.scout` off the interview drawer. That was one component —
 * but the SHAPE that produced it is a copy-paste one line long, and
 * `features/mandates/mandate-words.ts` had already named it in FIX-11/W10-2:
 *
 *     row.label ?? row.mandate_key        ← the raw key, in the place a name goes
 *     {row.mandateKey}                    ← the raw key, as a JSX child
 *
 * Every occurrence of that shape is a future walk finding. `mandateDisplayName`
 * exists so there is exactly one answer: the author's label, else the key's own
 * last segment title-cased — never the dotted key.
 *
 * A SINGLE LINE opts out with a trailing `// key-is-the-subject: <reason>`,
 * which is how an admin-gated mono sub-line keeps the key without exempting the
 * whole file around it. The reason is required, so the opt-out is a sentence a
 * reviewer reads, not a flag.
 *
 * WHAT THIS GUARD DOES NOT FORBID: the mandates CONSOLE and the mandate BROWSE
 * surfaces, where the key is the subject of the page and lives in its own mono
 * chip ("slugs live in mono chips; prose speaks labels"), and the authoring
 * surfaces whose whole sentence is "no job by that name exists yet — create
 * it", where the key is the thing to be created. Those are listed below, each
 * with its reason. Anything else that wants to print a key adds itself here
 * with a reason, in a diff a human reads.
 *
 * Proven failing-then-passing: run this scanner over the pre-fix revisions of
 * `features/masterwork/components/AgentCredit.tsx`,
 * `features/surfaces/components/chrome/SurfaceMandatesSection.tsx` and
 * `features/scraper/parts/agent-analysis/AnalysisMandateGate.tsx` and it
 * reports all three; on the working tree it reports none.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(__dirname, "..", "..", "..");

/**
 * Paths whose job IS the key. Each one is a prefix, and each one has a reason.
 */
const KEY_IS_THE_SUBJECT: ReadonlyArray<readonly [string, string]> = [
  [
    "features/mandates/mandate-words.ts",
    "THE primitive itself — the one sanctioned last resort when a key has no derivable segment",
  ],
  [
    "features/mandates/admin/",
    "the mandates console — the key is the row's identity and lives in a mono chip",
  ],
  [
    "features/mandates/browse/",
    "the mandate browser — same: the key is what the reader came to look up",
  ],
  [
    "features/mandates/authoring/",
    "authoring a mandate that DOES NOT EXIST yet — there is no declaration to read a name from, and the key is the thing the reader must go create",
  ],
  [
    "features/mandates/workspace/",
    "one mandate's own workspace — the key is the page's subject",
  ],
  [
    "features/mandates/components/MandateAgentPicker.tsx",
    "the binding picker for ONE named mandate — an admin control, key as its heading",
  ],
  [
    "features/bindings/",
    "the binding console — an engineer's inventory of keys, holders and scopes",
  ],
  [
    "features/window-panels/windows/mandates/",
    "the mandate window — the key IS what the window is about",
  ],
  [
    "features/window-panels/windows/agents/AgentConvertSystemWindow.tsx",
    "the system-agent conversion window — a super-admin repair tool addressed by key",
  ],
  [
    "features/agents/components/admin/",
    "agent admin — same lane as the binding console",
  ],
  [
    "features/agents/redux/execution-system/",
    "telemetry and log fields, not screen text",
  ],
  [
    "features/proof-runs/",
    "the proof-run scoreboard — an engineering surface, key in a mono chip",
  ],
  [
    "features/marketing/seo/value-system/settings/",
    "the autonomy-mode settings editor — an admin knob screen, key as a mono link to the mandate",
  ],
  [
    "features/admin/",
    "admin-only operations screens, addressed by key",
  ],
  [
    "features/surfaces/admin-detail/",
    "the surface admin detail page — an engineer's inventory of a surface's keys",
  ],
  [
    "features/surfaces/components/hub/",
    "the surfaces hub — an engineer's inventory, same as above",
  ],
  [
    "app/(admin)/",
    "the whole admin app — super-admin only, keys are its subject matter",
  ],
];

/**
 * THE SHAPES. Two, and they are the two that actually happened.
 *   1. a JSX child that is nothing but a mandate-key expression;
 *   2. a `?? <key>` / `|| <key>` fallback, which is how a missing label turns
 *      into a printed key.
 */
const BARE_JSX_CHILD =
  /^\s*\{\s*(?:[A-Za-z_$][\w$]*(?:\?)?\.)*(?:mandateKey|mandate_key)\s*\}\s*$/;
const KEY_AS_LABEL_FALLBACK =
  /(\?\?|\|\|)\s*(?:[A-Za-z_$][\w$]*(?:\?)?\.)*(?:mandateKey|mandate_key)\b/;
/** A per-line opt-out that must carry a reason. */
const LINE_OPT_OUT = /\/\/\s*key-is-the-subject:\s*\S/;

function sourceFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "features", "app", "components", "lib"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter((p) => /\.tsx?$/.test(p))
    .filter((p) => !/\.(test|spec)\.tsx?$/.test(p))
    .filter((p) => !p.includes("/__tests__/"));
}

function exemptReason(path: string): string | null {
  for (const [prefix, reason] of KEY_IS_THE_SUBJECT) {
    if (path.startsWith(prefix)) return reason;
  }
  return null;
}

/** Exported so the pre-fix proof can run the exact same scanner over old text. */
export function findingsIn(path: string, source: string): string[] {
  const found: string[] = [];
  source.split("\n").forEach((line, index) => {
    // A comment is not a screen. This class is quoted in the very docblocks that
    // forbid it, so a scanner that cannot tell the two apart cries wolf forever.
    if (LINE_OPT_OUT.test(line)) return;
    const code = line.replace(/^\s*(?:\/\/|\*|\/\*).*$/, "");
    if (BARE_JSX_CHILD.test(code)) {
      found.push(`${path}:${index + 1} — a mandate key rendered as a JSX child`);
    } else if (KEY_AS_LABEL_FALLBACK.test(code)) {
      found.push(
        `${path}:${index + 1} — a mandate key used as the fallback for a name`,
      );
    }
  });
  return found;
}

describe("no disclosure surface prints a mandate key", () => {
  it("finds the shape when it is there (self-test)", () => {
    expect(
      findingsIn("x.tsx", "      {row.mandateKey}\n"),
    ).toHaveLength(1);
    expect(
      findingsIn("x.tsx", "  {identity?.label ?? row.mandateKey}\n"),
    ).toHaveLength(1);
    expect(
      findingsIn("x.tsx", "  {mandateDisplayName(row.mandateKey, label)}\n"),
    ).toHaveLength(0);
    // The opt-out needs a reason — a bare marker does not silence anything.
    expect(
      findingsIn("x.tsx", "  {row.mandateKey} // key-is-the-subject:\n"),
    ).toHaveLength(1);
    expect(
      findingsIn(
        "x.tsx",
        "  {row.mandateKey} // key-is-the-subject: admin-only mono sub-line\n",
      ),
    ).toHaveLength(0);
  });

  it("reports nothing across every product surface", () => {
    const findings: string[] = [];
    for (const path of sourceFiles()) {
      if (exemptReason(path)) continue;
      const source = readFileSync(join(ROOT, path), "utf8");
      findings.push(...findingsIn(path, source));
    }
    expect(findings).toEqual([]);
  });

  it("keeps every exemption pointed at a path that still exists", () => {
    const files = sourceFiles();
    for (const [prefix] of KEY_IS_THE_SUBJECT) {
      expect(
        files.some((path) => path.startsWith(prefix)),
        // A stale exemption is a hole nobody can see.
      ).toBe(true);
    }
  });
});
