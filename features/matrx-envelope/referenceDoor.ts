// TEMP: HEAD model for red proof — replaced below.
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { KnownItemType } from "@/features/item-presentation/types";
import { entityTokenForItemType } from "@/features/item-presentation/registry";
import { getReferenceResolver } from "./referenceResolvers";

export type ReferenceDoor =
  | { kind: "open"; itemType: KnownItemType; id: string; token: string | null }
  | { kind: "address"; token: string; id: string; href: string | null; canPeek: boolean }
  | { kind: "none"; reason: string };

export function referenceDoor(type: string, ref: Record<string, string>): ReferenceDoor {
  const resolver = getReferenceResolver(type);
  const id = resolver?.openId(ref);
  const itemType = resolver?.openItemType;
  if (!resolver || !id || !itemType || !isUuidShape(id)) return { kind: "none", reason: "no id" };
  return { kind: "open", itemType, id, token: entityTokenForItemType(itemType) };
}
