import type { StudySummary } from "@/features/content-ir/kinds/generated/kinds.generated";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { StudyMediaRow } from "@/features/education/media/types";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

const MAX_SUMMARIES_PER_WRITE = 25;

type SummaryPatch = {
  id: string;
  version: number;
  summary: StudySummary;
  irEnvelope: Record<string, unknown>;
  trust: TrustEnvelope | null;
  changed: string[];
};

function record(value: unknown, at: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${at} must be an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs text.`);
  return value.trim();
}

function optionalText(value: unknown, at: string): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(`${at} must be text.`);
  return value.trim();
}

function summaryTrust(raw: unknown): TrustEnvelope | null {
  const current = coerceTrustEnvelope(raw);
  return current ? { ...current, confidence: "inferred" } : null;
}

/** Parse the registered `study_summary` shape, never accepting a caller-supplied trust claim. */
export function parseStudySummary(value: unknown, at = "study summary"): StudySummary {
  const raw = record(value, at);
  const title = requiredText(raw.title, `${at}.title`);
  const summary_markdown = requiredText(raw.summary_markdown, `${at}.summary_markdown`);
  if (!Array.isArray(raw.key_points)) throw new Error(`${at}.key_points must be an array.`);
  const key_points = raw.key_points
    .map((point, index) => optionalText(point, `${at}.key_points[${index}]`))
    .filter(Boolean);
  return { __kind: "study_summary", title, summary_markdown, key_points };
}

function idOf(value: unknown, at: string): string {
  if (typeof value === "string") return requiredText(value, at);
  return requiredText(record(value, at).id, `${at}.id`);
}

function titleOf(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const title = (value as Record<string, unknown>).title;
  return typeof title === "string" ? title : "";
}

export function parseCreateSummaries(value: unknown): StudySummary[] {
  const target = "create_summaries";
  return collectProblems(target, readCollectionList(target, "summaries", value, MAX_SUMMARIES_PER_WRITE),
    (item, index) => parseStudySummary(item, `${target}[${index}]`), {
      listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.title ?? titleOf(item.raw)), "title")],
    });
}

export function parseSummaryIds(value: unknown, target: string, available: readonly { id: string }[]): string[] {
  return collectProblems(target, readCollectionList(target, "summaries", value, MAX_SUMMARIES_PER_WRITE),
    (item, index) => {
      const id = idOf(item, `${target}[${index}]`);
      if (!available.some((row) => row.id === id)) throw new Error(`${id} is not in the current summary list.`);
      return id;
    }, {
      listChecks: (items) => [repeatsProblem(target, items.map((item) => {
        try { return idOf(item.raw, target); } catch { return ""; }
      }), "id")],
    });
}

export function parseUpdateSummaries(value: unknown, available: readonly StudyMediaRow[]): SummaryPatch[] {
  const target = "update_summaries";
  return collectProblems(target, readCollectionList(target, "summaries", value, MAX_SUMMARIES_PER_WRITE),
    (item, index) => {
      const raw = record(item, `${target}[${index}]`);
      const id = requiredText(raw.id, `${target}[${index}].id`);
      const current = available.find((row) => row.id === id);
      if (!current) throw new Error(`${id} is not in the current summary list.`);
      const changed = Object.keys(raw).filter((key) => key !== "id");
      if (changed.length === 0) throw new Error(`${target}[${index}] needs at least one field to change.`);
      const allowed = ["title", "summary_markdown", "key_points", "expected_revision"];
      const unknown = changed.filter((key) => !allowed.includes(key));
      if (unknown.length) throw new Error(`${target}[${index}] does not accept ${unknown.join(", ")}.`);
      const expectedRevision = raw.expected_revision;
      if (typeof expectedRevision !== "number") {
        throw new Error(`${target}[${index}].expected_revision is required. Reload the summary before changing it.`);
      }
      if (expectedRevision !== current.version) {
        throw new Error(`${target}[${index}].expected_revision is stale. Reload the summary before changing it.`);
      }
      const previous = record(current.ir_envelope, `summary ${id}`);
      const summary = parseStudySummary({
        title: current.title,
        summary_markdown: optionalText(previous.summary_markdown ?? previous.markdown, `summary ${id}.summary_markdown`),
        key_points: previous.key_points,
        ...raw,
      }, `${target}[${index}]`);
      const trust = summaryTrust(previous.trust ?? current.trust);
      return {
        id,
        version: current.version,
        summary: trust ? { ...summary, trust } : summary,
        irEnvelope: { ...previous, ...summary, ...(trust ? { trust } : {}) },
        trust,
        changed: changed.filter((key) => key !== "expected_revision"),
      };
    }, {
      listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.id ?? titleOf(item.raw)), "id")],
    });
}
