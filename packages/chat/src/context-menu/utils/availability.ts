// features/context-menu-v3/utils/availability.ts
//
// THE CONSISTENCY STEP — how a shared section stays the SAME menu everywhere
// while honestly reflecting what this particular surface can do.
//
// 🚨 THE LAW (Arman, 2026-08-25):
//
//   "You will discover that some functionality is simply not possible on
//    certain pages. And so we need to make sure that although we create these
//    core canonical sections, that we include a way to disable features that
//    cannot be triggered from a certain page. That way, the menu remains
//    consistent, but inaccessible items are simply disabled. Ideally, when
//    something is disabled, we should add a tool tip that tells the user the
//    right surface to find that item working."
//
// The failure this prevents is subtle and expensive: a shared section adopted
// on a surface that cannot run two of its items gets FORKED — the adopter
// quietly drops those items, the section is now different on every page, and
// the reuse that made it valuable is gone. Worse, the user learns the menu is
// unreliable: the thing that was there yesterday is missing today.
//
// The answer is never to remove a row. A removed row teaches nothing; a
// disabled row with "Works on the Keyword Workbench" teaches where to go. So:
// the section is built ONCE with every action it has ever grown, and each host
// declares only what it CANNOT do, and why.
//
//   const section = useKeywordMenuSection({
//     …,
//     unavailable: {
//       "kw-pages": unavailableHere("the Keyword Workbench"),
//       "kw-intel": "This view has no library keywords",
//     },
//   });
//
// This module is deliberately tiny and dependency-free so every shared builder
// in `SECTIONS.md` can use it without pulling weight into the inert shell.

import type { ContextMenuExtraItem, ContextMenuExtraSection } from "../types";

/**
 * Item id → why it is unavailable on THIS surface. A falsy value means "this
 * item is fine here", so a host can compute the map without filtering:
 *
 *   unavailable={{ "kw-pages": !siteId && unavailableHere("a site workspace") }}
 */
export type AvailabilityMap = Record<
  string,
  string | undefined | null | false
>;

/**
 * The canonical phrasing for "not here, but there".
 *
 * One sentence, no period — it renders as a disabled row's subtext, which is
 * the ONE sanctioned use of `description` under THE DENSITY LAW. Naming the
 * destination is the whole point: "unavailable" teaches nothing, "Works on the
 * Keyword Workbench" is a direction.
 */
export function unavailableHere(where: string): string {
  return `Works on ${where}`;
}

/** Needs something this row does not carry — the other honest disabled reason. */
export function needs(what: string): string {
  return `Needs ${what}`;
}

/**
 * Apply an availability map to a list of items, recursing into submenus.
 *
 * A disabled item keeps its label, its icon and its POSITION — the menu's shape
 * is identical on every surface. `onSelect` is replaced with a no-op as well as
 * setting `disabled`, so an item can never fire even if a renderer (or a future
 * layout) forgets to honour the flag. Links become non-navigating for the same
 * reason.
 */
export function applyAvailability(
  items: ContextMenuExtraItem[],
  map: AvailabilityMap | undefined,
): ContextMenuExtraItem[] {
  if (!map) return items;
  const has = (id: string): string | null => {
    const reason = map[id];
    return typeof reason === "string" && reason.trim() ? reason : null;
  };

  return items.map((item): ContextMenuExtraItem => {
    if (item.kind === "separator") return item;

    if (item.kind === "submenu") {
      const children = applyAvailability(item.children, map);
      const reason = has(item.id);
      // A submenu whose every child is disabled is itself dead — say so on the
      // parent too, so the user learns without opening it.
      const allChildrenDisabled =
        children.length > 0 &&
        children.every((c) => c.kind === "separator" || "disabled" in c && c.disabled);
      return {
        ...item,
        children,
        disabled: item.disabled || !!reason || allChildrenDisabled,
      };
    }

    const reason = has(item.id);
    if (!reason) return item;

    const base = { ...item, disabled: true, description: reason };
    if (base.kind === "link") return { ...base, href: "#" };
    if (base.kind === "checkbox")
      return { ...base, onCheckedChange: () => undefined };
    return { ...base, onSelect: () => undefined };
  });
}

/** `applyAvailability` for a whole section — the shape a builder returns. */
export function withAvailability(
  section: ContextMenuExtraSection,
  map: AvailabilityMap | undefined,
): ContextMenuExtraSection {
  if (!map) return section;
  return { ...section, items: applyAvailability(section.items, map) };
}
