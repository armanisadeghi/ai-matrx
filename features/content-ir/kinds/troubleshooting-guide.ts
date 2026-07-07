/**
 * troubleshooting_guide kind → TroubleshootingBlock bridge.
 *
 * Successor to the `<troubleshooting>` XML markdown dialect. The kind's
 * authored shape is the component's OWN data contract (TroubleshootingData in
 * components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx)
 * minus presentation ids:
 *
 *   { __kind:"troubleshooting_guide", title, description?, issues: [
 *       { __kind:"troubleshooting_issue", symptom, description?, severity?,
 *         causes, solutions: [
 *           { __kind:"troubleshooting_solution", title, description?,
 *             priority?, successRate?, tags?, steps: [
 *               { __kind:"troubleshooting_step", title, description,
 *                 commands?, links?, difficulty?, estimatedTime? } ] } ],
 *         relatedIssues? } ] }
 *
 * The JSON surface is a SUPERSET of the XML dialect: `severity`, `priority`,
 * `successRate`, and `tags` are rendered by the component but the legacy
 * markdown grammar cannot author them — only a kind arrival can light them up.
 * (`tags` is declared on the component's TroubleshootingSolution interface but
 * not currently rendered; it is carried for zero loss.)
 *
 * The bridge maps the reconstructed zero-loss value onto the exact serverData
 * `TroubleshootingArtifact` consumes verbatim (`resolveMarkdownPayload`
 * returns serverData untouched), synthesizing the same deterministic
 * `issue-N` / `solution-N` / `step-N` ids the component's own parser assigns
 * (global 1-based counters), so expansion/completion state keys behave
 * identically across the XML and JSON surfaces.
 */

import type { KindDefinition } from "../registry/kind-registry.types";
import type { KindSchema } from "../core/kind-schema.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  collectExtras,
  formatInlineValue,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas — mirror the component's interfaces exactly (field names included),
// minus the parser-assigned `id`s. Emitted DB schemas derive from these via
// convert/kind-to-json-schema.ts + registry/kind-storage-transform.ts.
// ---------------------------------------------------------------------------

const TROUBLESHOOTING_GUIDE_SCHEMA: KindSchema = {
  kind: "troubleshooting_guide",
  fields: {
    title: { type: "string", required: true },
    description: { type: "string" },
    issues: {
      type: "array",
      itemKinds: ["troubleshooting_issue"],
      required: true,
    },
  },
};

const TROUBLESHOOTING_ISSUE_SCHEMA: KindSchema = {
  kind: "troubleshooting_issue",
  fields: {
    symptom: { type: "string", required: true },
    description: { type: "string" },
    // The component color-codes low | medium | high | critical; any other
    // string renders with the neutral fallback badge (never an error).
    severity: { type: "string" },
    causes: { type: "string[]", required: true },
    solutions: {
      type: "array",
      itemKinds: ["troubleshooting_solution"],
      required: true,
    },
    relatedIssues: { type: "string[]" },
  },
};

const TROUBLESHOOTING_SOLUTION_SCHEMA: KindSchema = {
  kind: "troubleshooting_solution",
  fields: {
    title: { type: "string", required: true },
    description: { type: "string" },
    // low | medium | high (neutral fallback otherwise).
    priority: { type: "string" },
    // 0-100; renders as a 5-star rating + percentage.
    successRate: { type: "number" },
    tags: { type: "string[]" },
    steps: {
      type: "array",
      itemKinds: ["troubleshooting_step"],
      required: true,
    },
  },
};

const TROUBLESHOOTING_STEP_SCHEMA: KindSchema = {
  kind: "troubleshooting_step",
  fields: {
    title: { type: "string", required: true },
    description: { type: "string", required: true },
    // Copyable command blocks.
    commands: { type: "string[]" },
    links: { type: "array", itemKinds: ["troubleshooting_link"] },
    // easy | medium | hard (neutral fallback otherwise).
    difficulty: { type: "string" },
    // Free text, e.g. "2 min", "1 hour".
    estimatedTime: { type: "string" },
  },
};

const TROUBLESHOOTING_LINK_SCHEMA: KindSchema = {
  kind: "troubleshooting_link",
  fields: {
    title: { type: "string", required: true },
    url: { type: "string", required: true },
  },
};

// ---------------------------------------------------------------------------
// Bridge — complete envelopes only (the block renders the streaming loader
// mid-stream). Ids follow the legacy parser's convention: global 1-based
// counters across the whole guide.
// ---------------------------------------------------------------------------

type IdCounters = { issue: number; solution: number; step: number };

/** Copy every key except the structured ones (zero loss for unknown keys). */
function copyExtras(
  source: Record<string, unknown>,
  exclude: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (exclude.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Scalars coerce to strings; structural values are dropped (component-safe). */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
    else if (typeof item === "number" || typeof item === "boolean") {
      out.push(String(item));
    }
  }
  return out;
}

function mapLink(link: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof link.url !== "string" || link.url === "") return null;
  return {
    ...copyExtras(link, []),
    title:
      typeof link.title === "string" && link.title !== ""
        ? link.title
        : link.url,
    url: link.url,
  };
}

function mapStep(
  step: Record<string, unknown>,
  counters: IdCounters,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...copyExtras(step, ["commands", "links", "relatedIssues"]),
    id: `step-${counters.step++}`,
    // The legacy parser's own fallbacks — the component renders both directly.
    title:
      typeof step.title === "string" && step.title !== "" ? step.title : "Step",
    description:
      typeof step.description === "string" && step.description !== ""
        ? step.description
        : "No description provided",
  };
  if (Array.isArray(step.commands)) out.commands = stringArray(step.commands);
  if (Array.isArray(step.links)) {
    const links: Record<string, unknown>[] = [];
    for (const link of step.links) {
      if (!isRecord(link)) continue;
      const mapped = mapLink(link);
      if (mapped) links.push(mapped);
    }
    out.links = links;
  }
  return out;
}

function mapSolution(
  solution: Record<string, unknown>,
  counters: IdCounters,
): Record<string, unknown> {
  return {
    ...copyExtras(solution, ["steps"]),
    id: `solution-${counters.solution++}`,
    title:
      typeof solution.title === "string" && solution.title !== ""
        ? solution.title
        : "Solution",
    steps: Array.isArray(solution.steps)
      ? solution.steps
          .filter(isRecord)
          .map((step) => mapStep(step, counters))
      : [],
  };
}

function mapIssue(
  issue: Record<string, unknown>,
  counters: IdCounters,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...copyExtras(issue, ["causes", "solutions", "relatedIssues"]),
    id: `issue-${counters.issue++}`,
    symptom:
      typeof issue.symptom === "string" && issue.symptom !== ""
        ? issue.symptom
        : "Unknown Issue",
    causes: stringArray(issue.causes),
    solutions: Array.isArray(issue.solutions)
      ? issue.solutions
          .filter(isRecord)
          .map((solution) => mapSolution(solution, counters))
      : [],
  };
  if (Array.isArray(issue.relatedIssues)) {
    out.relatedIssues = stringArray(issue.relatedIssues);
  }
  return out;
}

export const troubleshootingServerDataFromEnvelope =
  makeCompleteEnvelopeBridge("troubleshooting_guide", (value) => {
    if (typeof value.title !== "string" || !Array.isArray(value.issues)) {
      return undefined;
    }
    const counters: IdCounters = { issue: 1, solution: 1, step: 1 };
    const issues = value.issues
      .filter(isRecord)
      .map((issue) => mapIssue(issue, counters));
    if (issues.length === 0) return undefined;
    return {
      ...copyExtras(value, ["issues"]),
      title: value.title,
      issues,
    };
  });

// ---------------------------------------------------------------------------
// toMarkdown facet — troubleshooting_guide → the component parser's OWN
// markdown dialect (### title, **Symptom:**, **Possible Causes:**,
// **Solutions:** with `N. **Title**: …` + `- **Step**: … (difficulty) (time)`
// bullets and indented command fences, **Related Issues:**). The export is
// therefore human-readable AND re-parseable by parseTroubleshootingMarkdown.
//
// Fields the dialect cannot express (severity, priority, successRate, tags,
// unknown keys) render as plain "Key: value" annotation lines, which the
// parser tolerates (ignores) on a round-trip — nothing silently vanishes,
// and no annotation line may start with "-" or a digit (those would re-parse
// as steps/causes).
// ---------------------------------------------------------------------------

const MD_GUIDE_KNOWN_KEYS = ["title", "description", "issues"];
const MD_ISSUE_KNOWN_KEYS = [
  "id",
  "symptom",
  "description",
  "severity",
  "causes",
  "solutions",
  "relatedIssues",
];
const MD_SOLUTION_KNOWN_KEYS = [
  "id",
  "title",
  "description",
  "priority",
  "successRate",
  "tags",
  "steps",
];
const MD_STEP_KNOWN_KEYS = [
  "id",
  "title",
  "description",
  "commands",
  "links",
  "difficulty",
  "estimatedTime",
];

/** "Key: value" lines — never bulleted (see module doc). Null when empty. */
function plainExtrasLines(extras: Record<string, unknown>): string | null {
  const entries = Object.entries(extras);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${formatInlineValue(value)}`)
    .join("\n");
}

function stepLine(step: Record<string, unknown>): string {
  const title = typeof step.title === "string" ? step.title : "Step";
  const description =
    typeof step.description === "string" ? step.description : "";
  const parts = [`   - **${title}**: ${description}`.trimEnd()];

  if (Array.isArray(step.links)) {
    for (const link of step.links) {
      if (!isRecordValue(link)) continue;
      if (typeof link.url !== "string") continue;
      const label = typeof link.title === "string" ? link.title : link.url;
      parts[0] += ` [${label}](${link.url})`;
    }
  }
  if (typeof step.difficulty === "string" && step.difficulty !== "") {
    parts[0] += ` (${step.difficulty})`;
  }
  if (typeof step.estimatedTime === "string" && step.estimatedTime !== "") {
    parts[0] += ` (${step.estimatedTime})`;
  }
  const stepExtras = plainExtrasLines(collectExtras(step, MD_STEP_KNOWN_KEYS));
  if (stepExtras) {
    parts[0] += ` (${stepExtras.replace(/\n/g, "; ")})`;
  }

  if (Array.isArray(step.commands)) {
    for (const command of step.commands) {
      if (typeof command !== "string" || command === "") continue;
      parts.push("     ```", `     ${command.replace(/\n/g, "\n     ")}`, "     ```");
    }
  }
  return parts.join("\n");
}

function solutionBlock(
  solution: Record<string, unknown>,
  index: number,
): string {
  const title = typeof solution.title === "string" ? solution.title : "Solution";
  const description =
    typeof solution.description === "string" && solution.description !== ""
      ? `: ${solution.description}`
      : ":";
  const lines = [`${index + 1}. **${title}**${description}`];

  const annotations: string[] = [];
  if (typeof solution.priority === "string" && solution.priority !== "") {
    annotations.push(`Priority: ${solution.priority}`);
  }
  if (typeof solution.successRate === "number") {
    annotations.push(`Success rate: ${solution.successRate}%`);
  }
  if (Array.isArray(solution.tags) && solution.tags.length > 0) {
    annotations.push(`Tags: ${formatInlineValue(solution.tags)}`);
  }
  const solutionExtras = plainExtrasLines(
    collectExtras(solution, MD_SOLUTION_KNOWN_KEYS),
  );
  if (solutionExtras) annotations.push(solutionExtras);
  if (annotations.length > 0) lines.push(annotations.join("\n"));

  if (Array.isArray(solution.steps)) {
    for (const step of solution.steps) {
      if (isRecordValue(step)) lines.push(stepLine(step));
    }
  }
  return lines.join("\n");
}

function issueMarkdown(issue: Record<string, unknown>): string {
  const blocks: Array<string | null> = [
    `**Symptom:** ${typeof issue.symptom === "string" ? issue.symptom : ""}`,
  ];

  const annotations: string[] = [];
  if (typeof issue.description === "string" && issue.description !== "") {
    annotations.push(issue.description);
  }
  if (typeof issue.severity === "string" && issue.severity !== "") {
    annotations.push(`Severity: ${issue.severity}`);
  }
  const issueExtras = plainExtrasLines(collectExtras(issue, MD_ISSUE_KNOWN_KEYS));
  if (issueExtras) annotations.push(issueExtras);
  if (annotations.length > 0) blocks.push(annotations.join("\n"));

  const causes = Array.isArray(issue.causes)
    ? issue.causes.filter((cause): cause is string => typeof cause === "string")
    : [];
  if (causes.length > 0) {
    blocks.push(
      `**Possible Causes:**\n${causes
        .map((cause, i) => `${i + 1}. ${cause}`)
        .join("\n")}`,
    );
  }

  const solutions = Array.isArray(issue.solutions)
    ? issue.solutions.filter(isRecordValue)
    : [];
  if (solutions.length > 0) {
    blocks.push(
      `**Solutions:**\n${solutions
        .map((solution, i) => solutionBlock(solution, i))
        .join("\n")}`,
    );
  }

  const related = Array.isArray(issue.relatedIssues)
    ? issue.relatedIssues.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (related.length > 0) {
    blocks.push(
      `**Related Issues:**\n${related.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  return joinBlocks(blocks);
}

export function troubleshootingMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Troubleshooting Guide";
  const issues = Array.isArray(value.issues)
    ? value.issues.filter(isRecordValue)
    : [];

  const guideExtras = plainExtrasLines(
    collectExtras(value, MD_GUIDE_KNOWN_KEYS),
  );

  return joinBlocks([
    `### ${title}`,
    typeof value.description === "string" ? value.description : null,
    ...issues.map(issueMarkdown),
    guideExtras ? `#### Additional details\n\n${guideExtras}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// KindDefinitions — exported for central integration into the compiled
// registry (registry/system-kinds.ts is owned by the orchestrator; this file
// makes NO registration edits).
// ---------------------------------------------------------------------------

export const TROUBLESHOOTING_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "troubleshooting_guide",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "troubleshooting",
    toLegacyServerData: troubleshootingServerDataFromEnvelope,
    toMarkdown: troubleshootingMarkdownFromValue,
    artifact: { canvasType: "troubleshooting" },
    persistence: { persistStructured: true },
    schema: TROUBLESHOOTING_GUIDE_SCHEMA,
  },
  {
    kind: "troubleshooting_issue",
    schemaSource: "system",
    tier: "eager",
    schema: TROUBLESHOOTING_ISSUE_SCHEMA,
  },
  {
    kind: "troubleshooting_solution",
    schemaSource: "system",
    tier: "eager",
    schema: TROUBLESHOOTING_SOLUTION_SCHEMA,
  },
  {
    kind: "troubleshooting_step",
    schemaSource: "system",
    tier: "eager",
    schema: TROUBLESHOOTING_STEP_SCHEMA,
  },
  {
    kind: "troubleshooting_link",
    schemaSource: "system",
    tier: "eager",
    schema: TROUBLESHOOTING_LINK_SCHEMA,
  },
];

// ---------------------------------------------------------------------------
// Canonical examples — the SAME payloads seeded as content_ir.kind_example
// rows by migrations/kind_troubleshooting_guide_full.sql (the simple one is
// is_canonical). The full example is derived from the component's own sample
// factory (createSampleTroubleshootingGuide) minus presentation ids, and
// exercises every rendered field: severity, priority, successRate, tags,
// commands, links, difficulty, estimatedTime, relatedIssues.
// ---------------------------------------------------------------------------

export const TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE: Record<string, unknown> = {
  __kind: "troubleshooting_guide",
  title: "Docker Build Fails",
  issues: [
    {
      __kind: "troubleshooting_issue",
      symptom: 'docker build exits with "no space left on device"',
      causes: [
        "Dangling images and build cache filling the disk",
        "Docker's data root on a small volume",
      ],
      solutions: [
        {
          __kind: "troubleshooting_solution",
          title: "Reclaim Docker disk space",
          description: "Prune unused layers and caches",
          steps: [
            {
              __kind: "troubleshooting_step",
              title: "Prune the system",
              description:
                "Remove stopped containers, unused images, and cache",
              commands: ["docker system prune -a --volumes"],
              difficulty: "easy",
              estimatedTime: "2 min",
            },
            {
              __kind: "troubleshooting_step",
              title: "Check remaining space",
              description: "Confirm the disk recovered",
              commands: ["df -h /var/lib/docker"],
              difficulty: "easy",
              estimatedTime: "1 min",
            },
          ],
        },
      ],
      relatedIssues: ["Slow image builds", "Out-of-memory during build"],
    },
  ],
};

export const TROUBLESHOOTING_GUIDE_EXAMPLE_FULL: Record<string, unknown> = {
  __kind: "troubleshooting_guide",
  title: "API Connection Issues",
  description: "Common problems and solutions for API connectivity",
  issues: [
    {
      __kind: "troubleshooting_issue",
      symptom: "Timeout errors when calling the API",
      description: "Requests to the API are timing out after 30 seconds",
      severity: "high",
      causes: [
        "Network connectivity issues",
        "Server overload",
        "Authentication problems",
        "Rate limiting",
      ],
      solutions: [
        {
          __kind: "troubleshooting_solution",
          title: "Check Network Connection",
          description:
            "Verify that your network connection is working properly",
          priority: "high",
          successRate: 85,
          tags: ["network", "connectivity"],
          steps: [
            {
              __kind: "troubleshooting_step",
              title: "Test with curl",
              description: "Use curl to test the API endpoint directly",
              commands: ["curl -X GET https://api.example.com/health"],
              difficulty: "easy",
              estimatedTime: "2 min",
            },
            {
              __kind: "troubleshooting_step",
              title: "Check DNS resolution",
              description: "Verify that the API domain resolves correctly",
              commands: ["nslookup api.example.com", "dig api.example.com"],
              difficulty: "easy",
              estimatedTime: "1 min",
            },
          ],
        },
        {
          __kind: "troubleshooting_solution",
          title: "Verify API Credentials",
          description: "Ensure your API key and credentials are valid",
          priority: "medium",
          successRate: 90,
          steps: [
            {
              __kind: "troubleshooting_step",
              title: "Check API key",
              description:
                "Verify that your API key is valid and not expired",
              difficulty: "easy",
              estimatedTime: "3 min",
              links: [
                {
                  __kind: "troubleshooting_link",
                  title: "API Key Management",
                  url: "https://example.com/api-keys",
                },
              ],
            },
          ],
        },
      ],
      relatedIssues: ["Slow response times", "Authentication failures"],
    },
    {
      __kind: "troubleshooting_issue",
      symptom: "Intermittent 401 Unauthorized responses",
      severity: "critical",
      causes: [
        "Expired access token",
        "Clock skew between client and server",
      ],
      solutions: [
        {
          __kind: "troubleshooting_solution",
          title: "Refresh the access token",
          priority: "high",
          steps: [
            {
              __kind: "troubleshooting_step",
              title: "Request a new token",
              description:
                "Exchange the refresh token for a new access token",
              difficulty: "medium",
            },
          ],
        },
      ],
    },
  ],
};
