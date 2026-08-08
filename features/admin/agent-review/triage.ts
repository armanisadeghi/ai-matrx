import { z } from "zod";
import { isJsonObject } from "@/types/json";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";

export const REVIEW_LANES = [
  "browser_ui",
  "code_only",
  "database_data",
  "backend_api",
  "deployment",
  "cross_system",
  "human_required",
] as const;

export const REVIEW_TOOLS = [
  "browser",
  "frontend_code",
  "backend_code",
  "database",
  "deployment",
  "authenticated_session",
  "external_service",
  "human_input",
] as const;

export const REVIEW_WORKSTREAMS = [
  "responsive_ui",
  "accessibility",
  "functional_bug",
  "fixture_data",
  "deployment",
  "cross_repo",
  "review_hygiene",
  "verification",
] as const;

export const REVIEW_PRIORITIES = ["critical", "high", "normal", "low"] as const;
export const REVIEW_ASSIGNMENT_MODES = [
  "origin_agent",
  "coordinator",
  "specialist",
] as const;
export const REVIEW_ASSIGNMENT_STATES = [
  "ready",
  "claimed",
  "blocked",
  "fixing",
  "verifying",
  "awaiting_review",
] as const;
export const REVIEW_BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;

const reviewAssignmentSchema = z.object({
  mode: z.enum(REVIEW_ASSIGNMENT_MODES),
  state: z.enum(REVIEW_ASSIGNMENT_STATES),
  owner: z.string().min(1).optional(),
  claimed_at: z.string().datetime({ offset: true }).optional(),
  batch_id: z.string().min(1).optional(),
  blocked_reason: z.string().min(1).optional(),
});

const reviewVerificationSchema = z.object({
  browser_breakpoints: z.array(z.enum(REVIEW_BREAKPOINTS)),
  notes: z.string().min(1).optional(),
  verified_at: z.string().datetime({ offset: true }).optional(),
  verified_by: z.string().min(1).optional(),
});

export const reviewTriageSchema = z.object({
  version: z.literal(1),
  lane: z.enum(REVIEW_LANES),
  required_tools: z.array(z.enum(REVIEW_TOOLS)).min(1),
  workstreams: z.array(z.enum(REVIEW_WORKSTREAMS)),
  priority: z.enum(REVIEW_PRIORITIES),
  assignment: reviewAssignmentSchema,
  verification: reviewVerificationSchema,
});

const reviewMetadataSchema = z
  .object({
    triage: reviewTriageSchema.optional(),
    origin: z
      .object({
        agent_label: z.string().min(1).optional(),
        thread_id: z.string().min(1).optional(),
        branch: z.string().min(1).optional(),
        commit: z.string().min(1).optional(),
      })
      .optional(),
  })
  .passthrough();

export type ReviewLane = (typeof REVIEW_LANES)[number];
export type ReviewTool = (typeof REVIEW_TOOLS)[number];
export type ReviewWorkstream = (typeof REVIEW_WORKSTREAMS)[number];
export type ReviewPriority = (typeof REVIEW_PRIORITIES)[number];
export type ReviewTriage = z.infer<typeof reviewTriageSchema>;

export const REVIEW_LANE_LABELS: Record<ReviewLane, string> = {
  browser_ui: "Browser + UI",
  code_only: "Code only",
  database_data: "Database + data",
  backend_api: "Backend + API",
  deployment: "Deployment",
  cross_system: "Cross-system",
  human_required: "Human required",
};

export const REVIEW_TOOL_LABELS: Record<ReviewTool, string> = {
  browser: "Browser",
  frontend_code: "Frontend code",
  backend_code: "Backend code",
  database: "Database",
  deployment: "Deployment",
  authenticated_session: "Signed-in session",
  external_service: "External service",
  human_input: "Human input",
};

export type ReviewMetadataResult =
  | { state: "ready"; triage: ReviewTriage }
  | { state: "missing" }
  | { state: "invalid"; issue: string };

export function parseReviewMetadata(value: unknown): ReviewMetadataResult {
  const parsed = reviewMetadataSchema.safeParse(value);
  if (!parsed.success) {
    return {
      state: "invalid",
      issue: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  if (!parsed.data.triage) return { state: "missing" };
  return { state: "ready", triage: parsed.data.triage };
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Deterministic suggestion for legacy rows. This never silently becomes stored
 * truth: callers must explicitly persist it in metadata.triage.
 */
export function suggestReviewTriage(
  row: Pick<ReviewQueueRow, "title" | "url" | "instructions" | "feedback">,
): ReviewTriage {
  // Feedback defines the repair scope. Titles/instructions describe the
  // artifact and often contain incidental words such as "API" or "DB" that
  // should not route a purely responsive repair to a backend specialist.
  const text = (row.feedback?.trim() || row.instructions).toLowerCase();

  const deployment = includesAny(text, [
    /\bunreleased\b/,
    /\buncommitted\b/,
    /\bbranch[- ]only\b/,
    /\bnot (?:yet )?(?:live|released|deployed|merged)\b/,
    /\bnot merged or deployed\b/,
    /\bknowingly not deployed\b/,
  ]);
  const database = includesAny(text, [
    /\bdatabase\b/,
    /\bsupabase\b/,
    /\bfixture\b/,
    /\bseed(?:ed|ing)?\b/,
    /\bentitlement\b/,
    /\bno data\b/,
    /\bstale (?:data|record|link)\b/,
    /\borganization not found\b/,
  ]);
  const backend = includesAny(text, [
    /\bbackend\b/,
    /\bpython\b/,
    /\bapi\b/,
    /\bmcp\b/,
    /\bwebsocket\b/,
    /\bstream(?:ing)?\b/,
  ]);
  const crossSystem = includesAny(text, [
    /\bcross[- ]repo\b/,
    /\bintegration\b/,
    /\boauth\b/,
    /\bfrontend and backend\b/,
  ]);
  const humanRequired = includesAny(text, [
    /\bhuman (?:input|approval|required)\b/,
    /\bpaid account\b/,
    /\bmanual approval\b/,
  ]);
  const browserUi = includesAny(text, [
    /\bui\b/,
    /\bux\b/,
    /\bmobile\b/,
    /\btablet\b/,
    /\bresponsive\b/,
    /\boverflow\b/,
    /\bclip(?:ped|ping)?\b/,
    /\bheading\b/,
    /\bh1\b/,
    /\btouch\b/,
    /\bbutton\b/,
    /\blabel\b/,
    /\blayout\b/,
    /\btable\b/,
  ]);

  let lane: ReviewLane = "code_only";
  if (browserUi) lane = "browser_ui";
  if (crossSystem) lane = "cross_system";
  if (backend) lane = "backend_api";
  if (database) lane = "database_data";
  if (deployment) lane = "deployment";
  if (humanRequired) lane = "human_required";

  const requiredTools = new Set<ReviewTool>(["frontend_code", "browser"]);
  if (deployment) requiredTools.add("deployment");
  if (database) requiredTools.add("database");
  if (backend) requiredTools.add("backend_code");
  if (crossSystem) requiredTools.add("external_service");
  if (
    includesAny(text, [
      /\bsign(?:ed)?[ -]in\b/,
      /\bauth(?:enticated)?\b/,
      /\baccount\b/,
    ])
  ) {
    requiredTools.add("authenticated_session");
  }
  if (humanRequired) requiredTools.add("human_input");

  const workstreams = new Set<ReviewWorkstream>(["verification"]);
  if (
    includesAny(text, [
      /\bmobile\b/,
      /\btablet\b/,
      /\bresponsive\b/,
      /\boverflow\b/,
      /\bclip(?:ped|ping)?\b/,
    ])
  ) {
    workstreams.add("responsive_ui");
  }
  if (
    includesAny(text, [
      /\bh1\b/,
      /\bheading\b/,
      /\bsemantic\b/,
      /\bunnamed\b/,
      /\baria\b/,
      /\blabel\b/,
      /\bcontrast\b/,
    ])
  ) {
    workstreams.add("accessibility");
  }
  if (
    includesAny(text, [
      /\bbroken\b/,
      /\berror\b/,
      /\b404\b/,
      /\bunreachable\b/,
      /\bcannot\b/,
      /\bcontradict/,
    ])
  ) {
    workstreams.add("functional_bug");
  }
  if (database) workstreams.add("fixture_data");
  if (deployment) workstreams.add("deployment");
  if (crossSystem) workstreams.add("cross_repo");
  if (
    includesAny(text, [
      /\bresubmit\b/,
      /\breview artifact\b/,
      /\buncommitted\b/,
      /\bunreleased\b/,
    ])
  ) {
    workstreams.add("review_hygiene");
  }

  const highPriority = includesAny(text, [
    /\bcatastrophic\b/,
    /\bunreachable\b/,
    /\b404\b/,
    /\bnot found\b/,
    /\bdeleted\b/,
    /\bcontradict/,
    /\bdoes not render\b/,
  ]);

  return {
    version: 1,
    lane,
    required_tools: REVIEW_TOOLS.filter((tool) => requiredTools.has(tool)),
    workstreams: REVIEW_WORKSTREAMS.filter((workstream) =>
      workstreams.has(workstream),
    ),
    priority: highPriority ? "high" : "normal",
    assignment: { mode: "coordinator", state: "ready" },
    verification: {
      browser_breakpoints: ["desktop", "tablet", "mobile"],
      notes:
        "Re-run the review instructions and confirm the requested fixes in the deployed target.",
    },
  };
}

export function metadataWithReviewTriage(
  metadata: unknown,
  triage: ReviewTriage,
): Record<string, unknown> {
  if (!isJsonObject(metadata)) {
    throw new Error(
      "Review metadata is not a JSON object; repair it before applying triage.",
    );
  }
  return { ...metadata, triage };
}
