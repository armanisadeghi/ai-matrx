import type { StudyKit } from "./kitService";
import { kitArtifactKey, kitMembershipFingerprint } from "./kitService";
import type { EducationLibraryRow } from "@/features/education/library/types";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";

const MAX_KITS_PER_WRITE = 25;

function record(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs text.`);
  const trimmed = value.trim();
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
  { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ? `${item.value.kit.sourceType}:${item.value.kit.sourceId}` : ""), "kit")] });
}

/** How many saved aids an open kit offers its agent as candidates (bounded; the person has the full picker). */
export const KIT_MEMBER_CANDIDATE_LIMIT = 25;

/**
 * `add_kit_members` on an OPEN kit: exactly one entry naming this kit, its current membership
 * fingerprint, and qualified { kind, id } refs that each match a current candidate. The same rules
 * the Add saved aids dialog and add_kit_members enforce; the write itself is `createManualKit` (one write path).
 */
export function parseKitMemberAdds(
  value: unknown,
  kit: StudyKit,
  candidates: readonly EducationLibraryRow[],
): { title: string; artifacts: EducationLibraryRow[]; expectedFingerprint: string } {
  const target = "add_kit_members";
  const list = readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE);
  if (list.length !== 1) throw new Error(`${target} accepts exactly one entry for the open kit.`);
  const raw = record(list[0], `${target}[0]`);
  if (raw.source_id !== kit.sourceId || raw.source_type !== kit.sourceType) {
    throw new Error(`${target}[0].source_id and source_type must equal kit_source_id and kit_source_type.`);
  }
  const expectedFingerprint = fingerprint(raw, `${target}[0]`);
  if (expectedFingerprint !== kitMembershipFingerprint(kit)) {
    throw new Error(`${target}[0].expected_membership_fingerprint is stale. Read kit_membership_fingerprint again.`);
  }
  const refs = raw.artifact_refs;
  if (!Array.isArray(refs) || !refs.length) throw new Error(`${target}[0].artifact_refs needs one or more saved study aids.`);
  const keys = refs.map((ref, index) => {
    const r = record(ref, `${target}[0].artifact_refs[${index}]`);
    return `${text(r.kind, `${target}[0].artifact_refs[${index}].kind`)}:${text(r.id, `${target}[0].artifact_refs[${index}].id`)}`;
  });
  if (new Set(keys).size !== keys.length) throw new Error(`${target}[0].artifact_refs must be distinct kind and id pairs.`);
  const inKit = new Set(kit.artifacts.map((artifact) => kitArtifactKey(artifact)));
  const artifacts = keys.map((key) => {
    if (inKit.has(key)) throw new Error(`${key} is already in this kit.`);
    const row = candidates.find((candidate) => `${candidate.kind}:${candidate.id}` === key);
    if (!row) throw new Error(`${key} is not one of kit_member_candidates.`);
    return row;
  });
  return { title: kit.title, artifacts, expectedFingerprint };
}
