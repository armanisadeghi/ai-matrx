"use client";

/**
 * Peek destination override.
 *
 * THE BUG THIS FIXES: `EntityDoorControls` accepts an `href` override for the
 * cases where a token alone cannot name the destination — the same record can
 * live behind different routes depending on WHO IS LOOKING (an agent shortcut
 * opens the user surface or the admin one; `resolveShortcutEditUrl` decides).
 * That override reached the control's own new-tab link but NOT the peek dialog
 * it opens, because `PeekDialog` re-resolves the route from `token` + `id`
 * through the entity registry. The result was a row whose two doors disagreed:
 * new-tab went to the admin surface, the peek's "Open" went to the user one.
 *
 * A dialog that contradicts the control that opened it is worse than either
 * alone — the same failure shape as an empty state contradicting its notice.
 *
 * WHY CONTEXT AND NOT A PROP: `PeekProps` is the uniform contract every peek
 * kind implements (`{id, open, onClose}`), and each kind renders `PeekDialog`
 * itself. Threading an href through would mean editing ~19 peek components and
 * would silently regress the moment someone adds the twentieth and forgets.
 * The override is cross-cutting, so it rides the tree instead: set once by the
 * host, read once by the dialog, no per-kind cooperation required.
 *
 * `null` is a meaningful value — "this caller has no destination for this
 * record" — and is honoured exactly, so a peek opened from a doorless surface
 * does not quietly fall back to a route the caller deliberately withheld.
 */

import React from "react";

/** `undefined` = no override in scope; `null` = deliberately no destination. */
const PeekHrefOverrideContext = React.createContext<string | null | undefined>(
  undefined,
);

export function PeekHrefOverrideProvider({
  href,
  children,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <PeekHrefOverrideContext.Provider value={href}>
      {children}
    </PeekHrefOverrideContext.Provider>
  );
}

/**
 * Returns the caller-supplied destination for the peek currently rendering,
 * or `undefined` when no caller expressed one (resolve from the token then).
 */
export function usePeekHrefOverride(): string | null | undefined {
  return React.useContext(PeekHrefOverrideContext);
}
