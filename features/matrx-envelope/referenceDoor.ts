/**
 * THE DOOR OF A REFERENCE CHIP — the one place a reference `(noun, item)`
 * becomes something a click can reach (THE DOOR LAW, no-dead-ends).
 *
 * The ladder (ruling R35, the same one `RecordDoor` climbs):
 *   1. `open`    — an item type opens the record IN PLACE and loads it (a
 *                  bespoke window, or the Detail primitive with a source —
 *                  the GENERIC Detail only when the entity has no peek).
 *   2. `address` — otherwise the entity's own address: a route (open / new
 *                  tab) and/or a registered peek, from the entity registry.
 *   3. `none`    — neither exists; the chip is an honest name, never a button
 *                  that does nothing.
 *
 * The item type is DERIVED from the table the resolver reads
 * (`recordTableTarget`), never cast from the noun: until 2026-10-02 every
 * catalog noun without an item-presentation registration (≈90) rendered an
 * enabled chip whose click silently did nothing, the education nouns opened
 * the FILE preview with a flashcard id, and studio sessions opened a seed-only
 * Detail panel. Guard: `__tests__/every-reference-chip-opens-its-record.test.ts`.
 */

import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { KnownItemType } from "@/features/item-presentation/types";
import {
  entityTokenForItemType,
  getItemConfig,
  opensOwnPresentation,
  opensTheRecord,
  recordTableTarget,
} from "@/features/item-presentation/registry";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { getReferenceResolver } from "./referenceResolvers";

interface AddressDoors {
  /** The record's route, for open / new tab. */
  href: string | null;
  /** A registered peek (bespoke or the generic registry peek). */
  canPeek: boolean;
  /** Key to hand `<ResourcePeekHost kind=…>`. */
  peekKind: string;
}

export type ReferenceDoor =
  | ({ kind: "open"; itemType: KnownItemType; id: string } & AddressDoors)
  | ({ kind: "address"; token: string; id: string } & AddressDoors)
  | { kind: "none"; reason: string };

const NO_ADDRESS: AddressDoors = { href: null, canPeek: false, peekKind: "" };

export function referenceDoor(
  type: string,
  ref: Record<string, string>,
): ReferenceDoor {
  const resolver = getReferenceResolver(type);
  if (!resolver) return { kind: "none", reason: "no resolver for this type" };
  const id = resolver.openId(ref);
  if (!id || !isUuidShape(id)) return { kind: "none", reason: "no record id" };

  const target = resolver.opensTable
    ? recordTableTarget(resolver.opensTable)
    : null;
  const itemType = resolver.openItemType ?? target?.itemType ?? null;
  const token =
    target?.token ?? (itemType ? entityTokenForItemType(itemType) : null);
  const address: AddressDoors = token
    ? (() => {
        const d = resolveEntityDoors(token, id);
        return { href: d.href, canPeek: d.canPeek, peekKind: d.peekKind };
      })()
    : NO_ADDRESS;

  if (itemType) {
    const { config, recognized } = getItemConfig(itemType);
    // The generic Detail shows the bare row (raw id, "Version / Visibility /
    // Origin"); the entity's OWN peek (a bespoke one — not the generic
    // registry peek, which is the same row dump) is its real view, so it wins
    // (G2 review, 2026-10-02: a project chip opened the row dump).
    const genericOverPeek =
      !opensOwnPresentation(config) && hasPeek(address.peekKind);
    if (recognized && opensTheRecord(config) && !genericOverPeek) {
      return { kind: "open", itemType, id, ...address };
    }
  }
  if (token && (address.href || address.canPeek)) {
    return { kind: "address", token, id, ...address };
  }
  return { kind: "none", reason: "no route, peek or window for this record" };
}
