// features/education/study/planner/coercePlan.ts
//
// Pure helpers to (1) format the study snapshot the planner agent reads and
// (2) coerce the agent's raw JSON output into a `PlanDraft` — the SAME shape the
// heuristic builder emits, so `planService.savePlan` is generator-agnostic.
// Tolerant of a slightly-off payload (drops unusable days/blocks; floors to safe
// defaults) so a prompt tweak never hard-breaks generation.

import type { PlanBlockDraft, PlanBlockKind, PlanDayDraft, PlanDraft, PlanInput } from "./types";
import type { PlanSummary } from "./buildPlan";
import { STUDY_AGENTS } from "./agents";

const BLOCK_KINDS: PlanBlockKind[] = [
  "review",
  "learn",
  "weak_area",
  "quiz",
  "practice_test",
  "rest",
  "custom",
];

/** Format the plan summary as the multi-line text the planner agent parses. */
export function buildStudySnapshot(
  summary: PlanSummary,
  itemType: string,
): string {
  const lines = [
    `Due for review: ${summary.dueCount}`,
    `Weak / struggling items: ${summary.weakCount}`,
    `Total items studied: ${summary.studiedCount ?? 0}`,
    `Item type: ${itemType}`,
  ];
  if (summary.weakTopics && summary.weakTopics.length > 0) {
    lines.push("Weak topics (topic name: count):");
    for (const t of summary.weakTopics.slice(0, 12)) {
      lines.push(`- ${t.topic}: ${t.count}`);
    }
  }
  return lines.join("\n");
}

function str(r: Record<string, unknown>, key: string): string {
  return typeof r[key] === "string" ? (r[key] as string).trim() : "";
}
function optStr(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNum(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function coerceBlock(raw: unknown, dayDate: string, order: number): PlanBlockDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const label = str(r, "label");
  if (!label) return null;
  const kindRaw = str(r, "target_kind") as PlanBlockKind;
  const targetKind: PlanBlockKind = BLOCK_KINDS.includes(kindRaw)
    ? kindRaw
    : "custom";
  const topic = optStr(r, "topic");
  return {
    dayDate,
    targetKind,
    itemType: null, // resolved by the caller (the plan's item_type)
    targetRef: topic ? { topic } : {},
    label,
    estimatedMinutes: Math.max(0, Math.round(optNum(r, "estimated_minutes") ?? 10)),
    estimatedItems: optNum(r, "estimated_items"),
    method: optStr(r, "method"),
    ordering: order,
    rationale: optStr(r, "rationale"),
  };
}

function coerceDay(raw: unknown): PlanDayDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const dayDate = str(r, "day_date");
  if (!isIsoDate(dayDate)) return null;
  const isRest = r.is_rest_day === true;
  const rawBlocks = Array.isArray(r.blocks) ? r.blocks : [];
  const blocks = rawBlocks
    .map((b, i) => coerceBlock(b, dayDate, i))
    .filter((b): b is PlanBlockDraft => b !== null);
  const targetMinutes = blocks.reduce((s, b) => s + b.estimatedMinutes, 0);
  return {
    dayDate,
    targetMinutes,
    isRestDay: isRest,
    rationale: optStr(r, "rationale"),
    blocks,
  };
}

/**
 * Coerce the planner agent's raw output into a `PlanDraft`. `input`/`summary`
 * supply the fields the agent doesn't echo (window, availability, item_type).
 * Throws (caught by the hook) only when NO usable days can be recovered.
 */
export function coercePlanDraft(
  value: unknown,
  input: PlanInput,
  summary: PlanSummary,
): PlanDraft {
  if (!value || typeof value !== "object") {
    throw new Error("Planner agent did not return a JSON object");
  }
  const obj = value as Record<string, unknown>;
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const itemType = input.itemType ?? "fc_card";
  const days = rawDays
    .map(coerceDay)
    .filter((d): d is PlanDayDraft => d !== null)
    // Stamp the plan's item_type onto every non-rest block.
    .map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({
        ...b,
        itemType: b.targetKind === "rest" ? null : itemType,
      })),
    }));

  if (days.length === 0) {
    throw new Error("Planner agent returned no usable days");
  }

  return {
    title: input.title,
    startDate: input.startDate,
    endDate: input.examDate,
    dailyMinutes: input.dailyMinutes,
    dailyItemCap: input.dailyItemCap ?? null,
    restDays: input.restDays,
    goalId: input.goalId ?? null,
    generatedBy: "ai",
    generatorAgentId: STUDY_AGENTS.planner,
    rationale:
      typeof obj.overall_rationale === "string"
        ? obj.overall_rationale.trim()
        : null,
    config: { summary, itemType, generatedFrom: "ai" },
    days,
  };
}
