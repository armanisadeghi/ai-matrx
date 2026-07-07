/**
 * `troubleshooting_legacy_text` — the named parser strategy behind the
 * `<troubleshooting>` XML surface (kind_surface: xml_tag/troubleshooting →
 * troubleshooting_guide).
 *
 * WRAPS the one existing legacy markdown parser — `parseTroubleshootingMarkdown`,
 * the exact grammar TroubleshootingArtifact renders raw region text through
 * today (### title, **Symptom:**, **Possible Causes:**, **Solutions:** with
 * `N. **Title**:` + `- **Step**:` bullets, indented command fences,
 * **Related Issues:**). It NEVER re-implements that grammar; it only maps the
 * parser's output onto the canonical troubleshooting_guide value, so the XML
 * surface converges to the SAME shape a `__kind` JSON arrival carries (THE
 * KEYSTONE).
 *
 * Ids: the legacy parser assigns presentation ids (`issue-N` / `solution-N` /
 * `step-N`); those are NOT part of the canonical value — the kind bridge
 * regenerates the identical ids deterministically, so XML → kind → component
 * produces byte-equal serverData to the legacy direct-parse path.
 *
 * Failure: the legacy parser NEVER returns zero issues — with no `**Symptom:**`
 * marker it fabricates a "General Issue" placeholder guide. For convergence
 * that placeholder is a parse FAILURE, so regions without a symptom marker
 * return null (the caller logs loudly and legacy rendering stands untouched).
 */

import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening tag with optional attributes, e.g. `<troubleshooting>` — host framing. */
const OPENING_TAG_RE = /^\s*<troubleshooting(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</troubleshooting>";

/** The marker every real issue starts with — see parseTroubleshootingMarkdown. */
const SYMPTOM_MARKER_RE = /^\s*\*\*Symptom:\*\*/m;

type ParsedGuide = ReturnType<typeof parseTroubleshootingMarkdown>;
type ParsedIssue = ParsedGuide["issues"][number];
type ParsedSolution = ParsedIssue["solutions"][number];
type ParsedStep = ParsedSolution["steps"][number];

function stepToKindValue(step: ParsedStep): Record<string, unknown> {
  return {
    [KIND_KEY]: "troubleshooting_step",
    title: step.title,
    description: step.description,
    ...(step.commands && step.commands.length > 0
      ? { commands: step.commands }
      : {}),
    ...(step.links && step.links.length > 0
      ? {
          links: step.links.map((link) => ({
            [KIND_KEY]: "troubleshooting_link",
            title: link.title,
            url: link.url,
          })),
        }
      : {}),
    ...(step.difficulty ? { difficulty: step.difficulty } : {}),
    ...(step.estimatedTime ? { estimatedTime: step.estimatedTime } : {}),
  };
}

function solutionToKindValue(solution: ParsedSolution): Record<string, unknown> {
  return {
    [KIND_KEY]: "troubleshooting_solution",
    title: solution.title,
    ...(solution.description ? { description: solution.description } : {}),
    ...(solution.priority ? { priority: solution.priority } : {}),
    ...(typeof solution.successRate === "number"
      ? { successRate: solution.successRate }
      : {}),
    ...(solution.tags && solution.tags.length > 0
      ? { tags: solution.tags }
      : {}),
    steps: solution.steps.map(stepToKindValue),
  };
}

function issueToKindValue(issue: ParsedIssue): Record<string, unknown> {
  return {
    [KIND_KEY]: "troubleshooting_issue",
    symptom: issue.symptom,
    ...(issue.description ? { description: issue.description } : {}),
    ...(issue.severity ? { severity: issue.severity } : {}),
    causes: issue.causes,
    solutions: issue.solutions.map(solutionToKindValue),
    ...(issue.relatedIssues && issue.relatedIssues.length > 0
      ? { relatedIssues: issue.relatedIssues }
      : {}),
  };
}

/**
 * Completed `<troubleshooting>` region text → canonical troubleshooting_guide
 * value, or null when the region carries no real issue (the caller treats
 * null as parse failure: loud, legacy rendering untouched).
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags, the splitter's is inner-only. This strategy only runs for
 * COMPLETED regions (the hosts gate on the closing tag); the parser needs no
 * completion sentinel — it reads the whole inner text line by line.
 */
export function troubleshootingLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.toLowerCase().indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  // No symptom marker → the parser could only fabricate its placeholder
  // guide. That is a convergence failure, not content.
  if (!SYMPTOM_MARKER_RE.test(inner)) return null;

  const parsed = parseTroubleshootingMarkdown(inner);
  if (parsed.issues.length === 0) return null;

  return {
    [KIND_KEY]: "troubleshooting_guide",
    title: parsed.title,
    ...(parsed.description ? { description: parsed.description } : {}),
    issues: parsed.issues.map(issueToKindValue),
  };
}
