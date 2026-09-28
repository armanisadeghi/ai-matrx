import type { MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";
import type { MemoryItemKind } from "@/components/mardown-display/blocks/memory-aid/MemoryAidBlock";
import { parseMemoryAid } from "./memoryWrites";

const collection = { mnemonic: "mnemonics", analogy: "analogies", locus: "loci" } as const;

export function removeMemoryItem(aid: MemoryAidPayload, kind: MemoryItemKind, index: number): MemoryAidPayload {
  if (kind === "locus") {
    const loci = aid.memory_palace.loci.filter((_, at) => at !== index);
    return { ...aid, memory_palace: { ...aid.memory_palace, applicable: loci.length > 0, theme: loci.length ? aid.memory_palace.theme : "", loci } };
  }
  return kind === "mnemonic"
    ? { ...aid, mnemonics: aid.mnemonics.filter((_, at) => at !== index) }
    : { ...aid, analogies: aid.analogies.filter((_, at) => at !== index) };
}

/** One child operation against one saved aid; used before approval and again at apply. */
export function parseMemoryItemChange(value: unknown, aid: MemoryAidPayload, version?: number): {
  aid: MemoryAidPayload;
  summary: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("change_memory_item needs an object with action, kind, and item or position.");
  const input = value as Record<string, unknown>;
  if (version !== undefined && input.expected_version !== version)
    throw new Error("This memory aid changed. Read aid_version and the current items, then submit a new change with expected_version.");
  const { action, kind } = input;
  if (action !== "add" && action !== "update" && action !== "delete")
    throw new Error("action must be add, update, or delete.");
  if (kind !== "mnemonic" && kind !== "analogy" && kind !== "locus")
    throw new Error("kind must be mnemonic, analogy, or locus.");
  const items = kind === "locus" ? aid.memory_palace.loci : aid[collection[kind]];
  const position = input.position === undefined && action === "add" ? items.length + 1 : input.position;
  if (!Number.isInteger(position) || typeof position !== "number" || position < 1 || position > items.length + (action === "add" ? 1 : 0))
    throw new Error(`position must be a number from 1 to ${items.length + (action === "add" ? 1 : 0)} for ${kind}.`);
  const index = position - 1;
  if (action === "delete") {
    const next = removeMemoryItem(aid, kind, index);
    return { aid: parseMemoryAid(next, "change_memory_item", true), summary: `Deleted ${kind} ${position}.` };
  }
  if (!input.item || typeof input.item !== "object" || Array.isArray(input.item))
    throw new Error(`item must be an object with the ${kind} fields.`);
  const item = action === "update" ? { ...items[index], ...input.item } : input.item;
  const nextItems: unknown[] = [...items];
  if (action === "add") nextItems.splice(index, 0, item);
  else nextItems[index] = item;
  const next = kind === "locus"
    ? { ...aid, memory_palace: { ...aid.memory_palace, applicable: true,
        theme: typeof input.theme === "string" ? input.theme : aid.memory_palace.theme, loci: nextItems } }
    : { ...aid, [collection[kind]]: nextItems };
  return { aid: parseMemoryAid(next, "change_memory_item", true), summary: `${action === "add" ? "Added" : "Updated"} ${kind} ${position}.` };
}
