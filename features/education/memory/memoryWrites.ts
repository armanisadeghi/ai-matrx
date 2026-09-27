import { MNEMONIC_TECHNIQUES, type MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";
import { collectProblems, readCollectionList, repeatsProblem } from "@/features/surfaces/runtime/collection-write-targets";
import type { StudyMediaRow } from "@/features/education/media/types";

const object = (value: unknown, at: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
};
const required = (value: unknown, at: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs text.`);
  return value.trim();
};
const optional = (value: unknown, at: string): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(`${at} must be text.`);
  return value.trim();
};
const rawField = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
};

/** The editor and agent writes save the same registered kind, including every child marker. */
export function parseMemoryAid(value: unknown, at = "memory aid", allowEmpty = false): MemoryAidPayload {
  const raw = object(value, at);
  const title = required(raw.title, `${at}.title`);
  if (!Array.isArray(raw.mnemonics) || !Array.isArray(raw.analogies))
    throw new Error(`${at} needs mnemonics and analogies arrays (either can be empty).`);
  const mnemonics = raw.mnemonics.map((item, i) => {
    const row = object(item, `${at}.mnemonics[${i}]`);
    const technique = required(row.technique, `${at}.mnemonics[${i}].technique`);
    if (!MNEMONIC_TECHNIQUES.some((candidate) => candidate === technique))
      throw new Error(`${at}.mnemonics[${i}].technique must be ${MNEMONIC_TECHNIQUES.join(", ")}.`);
    return {
      __kind: "mnemonic" as const,
      technique: technique as (typeof MNEMONIC_TECHNIQUES)[number],
      target: required(row.target, `${at}.mnemonics[${i}].target`),
      device: required(row.device, `${at}.mnemonics[${i}].device`),
      explanation: optional(row.explanation, `${at}.mnemonics[${i}].explanation`),
    };
  });
  const analogies = raw.analogies.map((item, i) => {
    const row = object(item, `${at}.analogies[${i}]`);
    return {
      __kind: "analogy" as const,
      concept: required(row.concept, `${at}.analogies[${i}].concept`),
      analogy: required(row.analogy, `${at}.analogies[${i}].analogy`),
      mapping: optional(row.mapping, `${at}.analogies[${i}].mapping`),
    };
  });
  const palace = object(raw.memory_palace, `${at}.memory_palace`);
  if (typeof palace.applicable !== "boolean" || !Array.isArray(palace.loci))
    throw new Error(`${at}.memory_palace needs applicable (boolean) and loci (array).`);
  const loci = palace.applicable ? palace.loci.map((item, i) => {
    const row = object(item, `${at}.memory_palace.loci[${i}]`);
    return {
      __kind: "locus" as const,
      place: required(row.place, `${at}.memory_palace.loci[${i}].place`),
      item: required(row.item, `${at}.memory_palace.loci[${i}].item`),
      image: optional(row.image, `${at}.memory_palace.loci[${i}].image`),
    };
  }) : [];
  if (palace.applicable && (!optional(palace.theme, `${at}.memory_palace.theme`) || !loci.length))
    throw new Error(`${at}.memory_palace needs a theme and at least one stop when enabled.`);
  if (!allowEmpty && !mnemonics.length && !analogies.length && !palace.applicable)
    throw new Error(`${at} needs at least one mnemonic, analogy, or memory palace.`);
  return {
    __kind: "memory_aid",
    title,
    strategy_note: optional(raw.strategy_note, `${at}.strategy_note`),
    mnemonics,
    analogies,
    memory_palace: {
      __kind: "memory_palace",
      applicable: palace.applicable,
      theme: palace.applicable ? optional(palace.theme, `${at}.memory_palace.theme`) : "",
      loci: palace.applicable ? loci : [],
    },
  };
}

export function parseCreateMemoryAids(value: unknown): MemoryAidPayload[] {
  const target = "create_memory_aids";
  return collectProblems(target, readCollectionList(target, "memory_aids", value),
    (item, i) => parseMemoryAid(item, `${target}[${i}]`), {
      listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.title ?? rawField(item.raw, "title")), "title")],
    });
}

export function parseMemoryIds(value: unknown, target: string, available: readonly { id: string }[]): string[] {
  return collectProblems(target, readCollectionList(target, "memory_aids", value), (item, i) => {
    const id = required(typeof item === "string" ? item : object(item, `${target}[${i}]`).id, `${target}[${i}].id`);
    if (!available.some((row) => row.id === id))
      throw new Error(`${id} is not in the current memory-aid list.`);
    return id;
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ?? (typeof item.raw === "string" ? item.raw : rawField(item.raw, "id"))), "id")] });
}

export function parseUpdateMemoryAids(value: unknown, available: readonly StudyMediaRow[]): { id: string; version: number; aid: MemoryAidPayload; changed: string[] }[] {
  const target = "update_memory_aids";
  return collectProblems(target, readCollectionList(target, "memory_aids", value), (item, i) => {
    const row = object(item, `update_memory_aids[${i}]`);
    const id = required(row.id, `update_memory_aids[${i}].id`);
    const current = available.find((candidate) => candidate.id === id);
    if (!current) throw new Error(`update_memory_aids: ${id} is not in the current memory-aid list.`);
    const changed = Object.keys(row).filter((key) => key !== "id");
    if (!changed.length) throw new Error(`update_memory_aids[${i}] needs at least one field to change.`);
    const allowed = ["title", "strategy_note", "mnemonics", "analogies", "memory_palace"];
    const unknown = changed.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`update_memory_aids[${i}] does not accept ${unknown.join(", ")}.`);
    const previous = object(current.ir_envelope, `memory aid ${id}`);
    const aid = parseMemoryAid({ ...previous, title: current.title, ...row }, `update_memory_aids[${i}]`, true);
    return { id, version: current.version, aid, changed };
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.id ?? rawField(item.raw, "id")), "id")] });
}
