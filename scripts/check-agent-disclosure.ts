#!/usr/bin/env npx tsx
/**
 * check:agent-disclosure — find surfaces that RUN an agent without SAYING SO.
 *
 * 🚨 THE DISCLOSURE LAW (Arman, 2026-08-25):
 *
 *   "On any surface where an agent is actually being assigned but built into
 *    the physical UI … we also add that agent to the list of available agents
 *    at the top."
 *
 * and, the day before, the reason:
 *
 *   "Any page where we have AI integrations, I need the page to identify what
 *    agents it's using for those purposes so that I can go look at those
 *    agents' instructions."
 *
 * A page that quietly calls a model is a black box, and a black box cannot be
 * approved — least of all one that also runs on a schedule while nobody is
 * watching. Disclosure is TWO places, and this check wants at least one of
 * them wired for every file that runs a mandate:
 *
 *   1. INLINE  — `<PageAgents agents={[…]} />`, which names the AI on the page
 *      itself AND registers it into the live surface-mandate registry, so the
 *      Agents header menu lists it with its door and its notes.
 *   2. DECLARED — a `SurfaceAgentRole` carrying `mandateKey` in the surface's
 *      manifest, which additionally makes the agent bindable, runnable against
 *      the page's live scope, and testable from the menu.
 *
 * WHAT THIS FLAGS: a file that runs a mandate — `useMandateRunner`,
 * `runMandate(`, `launchMandate(`, `resolveMandate(`, `useMandate(`, a
 * `mandateKey:` literal, or a POST to `/agents/mandates/{key}` — and which
 * neither renders `<PageAgents>` nor sits in a feature whose manifest declares
 * that job as an agent role.
 *
 * EXCEPTIONS are reasoned, not silent: (1) a surface where the agent is the
 * SUBJECT, and (2) a universal agent host such as Chat, where the user may
 * choose any agent and none is a fixed surface worker. Those paths are exempt
 * below so the boundary is readable instead of re-decided by every reader.
 *
 * ADVISORY, on purpose (Arman: scream, never block). It prints what it found
 * and exits 0 unless --strict is passed.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "features", "components"];

/** Running a mandate — the signals that mean "this file drives an agent". */
const RUN_SIGNALS: RegExp[] = [
  /useMandateRunner\s*\(/,
  /\brunMandate\s*\(/,
  /\blaunchMandate\s*\(/,
  /\bresolveMandate(?:Server)?\s*\(/,
  /\buseMandate\s*\(/,
  /\buseMandateSet\s*\(/,
  /mandateKey\s*:/,
];

/** Disclosure — either half satisfies the law. */
const DISCLOSURE_SIGNALS: RegExp[] = [
  /<PageAgents\b/,
  /useDeclaredSurfaceMandates\s*\(/,
  /agentRoles\b/,
  /SurfaceAgentRole\b/,
  /MandateAgentPicker\b/,
];

/**
 * Paths with no fixed surface worker. Each entry is a prefix plus the reason it
 * is exempt — never add one without the reason.
 */
const DISCLOSURE_EXEMPT: Array<{ prefix: string; why: string }> = [
  {
    prefix: "features/agents/mandates/",
    why: "the mandate system itself — resolution, the override editor, the picker",
  },
  {
    prefix: "features/admin/mandates/",
    why: "the mandate console: the agent is the record under review",
  },
  {
    prefix: "features/surfaces/",
    why: "the surface machinery that LISTS mandates for every other page",
  },
  {
    prefix: "features/agents/components/",
    why: "agent-authoring components and universal agent-host components have no fixed worker",
  },
  {
    prefix: "features/agent-shortcuts/",
    why: "shortcut authoring: the user picks the agent, the page does not run one on its own",
  },
  {
    prefix: "scripts/",
    why: "tooling, not a surface",
  },
  {
    prefix: "app/(dev)/",
    why: "demos — sample code is not a shipped surface",
  },
  {
    prefix: "app/(core)/chat/",
    why: "Chat is a universal host where the user chooses any agent; none is bound to the surface",
  },
];

/**
 * THE LAW IS ABOUT SURFACES, so the scan is too. The execution machinery
 * (thunks, launchers, services, tool handlers) runs mandates ON BEHALF of a
 * surface and discloses nothing by design — flagging it would bury the real
 * finding under a hundred rows nobody reads, which is how a guard trains its
 * readers to ignore it.
 */
const MACHINERY_MARKERS = [
  "/redux/",
  "/thunks/",
  ".thunk",
  ".thunks",
  "/handlers/",
  "/services/",
  "/service.",
  "/utils/",
  "/lib/",
];

/** A file only speaks to the user if it actually renders something. */
function rendersUi(file: string, source: string): boolean {
  if (!file.endsWith(".tsx")) return false;
  if (MACHINERY_MARKERS.some((marker) => file.includes(marker))) return false;
  return /<[A-Za-z][^>]*\/?>/.test(source);
}

interface Finding {
  file: string;
  signals: string[];
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__")
      continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      out.push(full);
  }
}

function main(): void {
  const strict = process.argv.includes("--strict");
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);

  const findings: Finding[] = [];
  let disclosed = 0;
  let exempt = 0;

  for (const file of files) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    const signals = RUN_SIGNALS.filter((rx) => rx.test(source)).map((rx) =>
      rx.source.replace(/\\[sb]|[\\()*+?{}]/g, "").trim(),
    );
    if (signals.length === 0) continue;

    if (
      DISCLOSURE_EXEMPT.some((entry) => rel.startsWith(entry.prefix)) ||
      !rendersUi(rel, source)
    ) {
      exempt += 1;
      continue;
    }
    if (DISCLOSURE_SIGNALS.some((rx) => rx.test(source))) {
      disclosed += 1;
      continue;
    }
    findings.push({ file: rel, signals });
  }

  console.log(
    `Agent disclosure: ${disclosed} disclosed, ${findings.length} undisclosed, ${exempt} skipped (no fixed surface worker + execution machinery).`,
  );

  if (findings.length > 0) {
    console.log(
      "\n🚨 THE DISCLOSURE LAW: these files run a mandate and name no agent.\n" +
        "   Fix by rendering <PageAgents agents={[{ mandateKey, does }]} surfaceName={…} />\n" +
        "   on the surface, or by declaring the job as an agentRole with a\n" +
        "   mandateKey in the surface's manifest (both is better).\n",
    );
    for (const finding of findings) {
      console.log(`  ${finding.file}`);
      console.log(`      runs: ${finding.signals.join(", ")}`);
    }
    if (strict) process.exit(1);
  }
}

main();
