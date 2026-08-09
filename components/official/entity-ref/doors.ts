/**
 * Door resolution — the ONE place a (token, id) pair becomes reachable doors.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it. Two
 * different presentations need the same answer:
 *
 *   `EntityRef`      — a NAME with doors (the default; prefer it always)
 *   `MatrxUuidCell`  — an ID with doors (only when the name genuinely isn't
 *                      loaded — a raw FK column in a dense admin table)
 *
 * Both call `resolveEntityDoors`, so a registry edit lights up both at once and
 * neither can drift from the other. This module is deliberately component-free
 * and cheap to import: it pulls the entity registry (icons + `hrefFor`) and the
 * peek KIND LIST — never `features/organizations/peek/registry.ts`, which
 * statically imports all 19 peek components (THE FRAGMENTATION LAW).
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 *   route → `hrefFor` in `features/scopes/registry/entityRegistry.ts`
 *   peek  → `features/organizations/peek/registry.ts` + `kinds-list.ts`
 */

import type { LucideIcon } from "lucide-react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { hasPeek } from "@/features/organizations/peek/kinds-list";

/**
 * Entity tokens whose peek is registered under a different catalogue key.
 * Keep this at zero entries wherever possible — the real fix is aligning the
 * peek registry key with the canonical token.
 */
const PEEK_KEY_BY_TOKEN: Record<string, string> = {
  app: "agent_app",
  structured_list: "picklist",
};

export interface EntityDoors {
  /** Canonical route to the record, or null when the token has no `hrefFor`. */
  href: string | null;
  /** True when a peek is registered for this token. */
  canPeek: boolean;
  /** Catalogue key to hand `<ResourcePeekHost kind=…>`. */
  peekKind: string;
  /** Registry icon for the entity type, when one is registered. */
  Icon: LucideIcon | null;
  /** Singular display label ("Agent", "Note"), or null for unknown tokens. */
  label: string | null;
}

/**
 * Resolve every door we can open for one record.
 *
 * `hrefOverride` wins over the registry route — for records that live in two
 * shells (a system agent under `/administration/…` vs a personal one under
 * `/agents/…`). It is honoured EXACTLY: an explicit `null` means "this
 * particular record has no door" and must not fall through to the registry,
 * which would send the user somewhere the caller deliberately ruled out. Only
 * `undefined` (no opinion) defers.
 *
 * Unknown tokens degrade to "no doors", never throw: a surface passing a token
 * we don't register yet must still render its text.
 */
export function resolveEntityDoors(
  token: string,
  id: string,
  hrefOverride?: string | null,
): EntityDoors {
  const info = tryGetEntityInfo(token);
  const peekKind = PEEK_KEY_BY_TOKEN[token] ?? token;
  return {
    href:
      hrefOverride !== undefined
        ? hrefOverride
        : (info?.hrefFor?.(id) ?? null),
    canPeek: hasPeek(peekKind),
    peekKind,
    Icon: info?.Icon ?? null,
    label: info?.label ?? null,
  };
}

/**
 * Resolve an FK COLUMN NAME to a canonical entity token — `agent_id` → `agent`,
 * `task_id` → `task`. Deliberately strict: exact `<token>_id` only, and only
 * for tokens that actually have a door. Anything else returns null rather than
 * guessing, because a wrong link is worse than no link (a `<token>_id` that
 * points somewhere else would send the user to another record entirely).
 *
 * Used by generic surfaces that render a row's raw columns (the data-table row
 * inspector) and therefore can't be told each column's target by hand.
 */
export function tokenFromColumnName(column: string): string | null {
  const name = column.trim().toLowerCase();
  if (!name.endsWith("_id")) return null;
  const token = name.slice(0, -3);
  if (!token) return null;
  return hasAnyDoor(token) ? token : null;
}

/**
 * True when the platform can open this token at all (route or peek).
 * Use it to decide whether a bare id is worth rendering as a door — never to
 * decide whether to render the record at all.
 */
export function hasAnyDoor(token: string): boolean {
  const info = tryGetEntityInfo(token);
  return Boolean(info?.hrefFor) || hasPeek(PEEK_KEY_BY_TOKEN[token] ?? token);
}
