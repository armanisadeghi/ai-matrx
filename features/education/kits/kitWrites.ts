import type { StudyKit } from "./kitService";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

const MAX_KITS_PER_WRITE = 25;

function record(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs text.`);
  const trimmed = value.trim();
  if (trimmed.length > 200) throw new Error(`${at} must be 200 characters or fewer.`);
  return trimmed;
}

function kitFor(raw: Record<string, unknown>, at: string, kits: readonly StudyKit[]): StudyKit {
  const sourceId = text(raw.source_id, `${at}.source_id`);
  const sourceType = text(raw.source_type, `${at}.source_type`);
  const kit = kits.find((candidate) => candidate.sourceId === sourceId && candidate.sourceType === sourceType);
  if (!kit) throw new Error(`${sourceType}:${sourceId} is not in the current kit list.`);
  return kit;
}

function fingerprint(raw: Record<string, unknown>, at: string): string {
  return text(raw.expected_membership_fingerprint, `${at}.expected_membership_fingerprint`);
}

export function parseKitUpdates(value: unknown, kits: readonly StudyKit[]) {
  const target = "update_kits";
  return collectProblems(target, readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE), (item, index) => {
    const raw = record(item, `${target}[${index}]`);
    return { kit: kitFor(raw, `${target}[${index}]`, kits), fingerprint: fingerprint(raw, `${target}[${index}]`), title: text(raw.title, `${target}[${index}].title`) };
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ? `${item.value.kit.sourceType}:${item.value.kit.sourceId}` : ""), "kit")] });
}

export function parseKitDeletes(value: unknown, kits: readonly StudyKit[]) {
  const target = "delete_kits";
  return collectProblems(target, readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE), (item, index) =>
    (() => { const raw = record(item, `${target}[${index}]`); return { kit: kitFor(raw, `${target}[${index}]`, kits), fingerprint: fingerprint(raw, `${target}[${index}]`) }; })(),
  { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ? `${item.value.sourceType}:${item.value.sourceId}` : ""), "kit")] });
}
