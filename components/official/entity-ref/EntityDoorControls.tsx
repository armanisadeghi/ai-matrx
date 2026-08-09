"use client";

/**
 * EntityDoorControls — the DOORS, without the name.
 *
 * `EntityRef` is the default: it renders a record's name AS the door. But some
 * surfaces genuinely cannot make the name an anchor:
 *
 *   - the name is an inline EDITOR (`AssociationEntitySelect` — click to rename)
 *   - the name sits inside a `<button>` whose click means something else
 *     (a picker row, where clicking = attach). An `<a>` inside a `<button>` is
 *     invalid DOM and a hydration error, and a stray click that navigated away
 *     would cost the user the picker they are standing in.
 *
 * Those surfaces render this cluster as a SIBLING of the name. It is the same
 * implementation `EntityRef` uses (EntityRef composes it), so a registry edit
 * lights up both and neither can drift.
 *
 * Same-tab "Open" is OPT-IN (`showOpen`) precisely because the callers above are
 * mid-task surfaces: peek + new tab answer "which one is that?" without
 * destroying what the user is doing. Pass `showOpen` when the surface is a plain
 * list the user can safely leave.
 *
 * Hover reveal: controls fade in on hover of EITHER the named `group/entity-ref`
 * (what `EntityRef` puts on its own wrapper) OR a plain Tailwind `group`, which
 * is what almost every row in this codebase already carries for its other
 * hover-revealed affordances.
 *
 * Accepting both is deliberate and load-bearing. The named group alone made a
 * silent, invisible failure the DEFAULT for standalone callers: forget the
 * class and the doors render at `opacity-0`, so the surface looks finished, the
 * markup is right, type-check and lint are green — and the user simply cannot
 * see the door. That is the exact dead end this module exists to remove, and it
 * shipped twice (the two debug-window sidebars, 2026-08-09) before Bugbot
 * caught it. A primitive whose correct use depends on remembering an invisible
 * convention will be misused; make the common case work instead.
 *
 * `alwaysShowActions` still pins them visible for surfaces with no hover at all
 * (a window title bar, a touch-first list). **Reach for it in any popover or
 * transient panel too**: `opacity-0` does not disable hit-testing, so on touch
 * the hover form is the worst case — invisible controls that are still
 * tappable. The row reserves their width either way (this cluster is
 * `shrink-0`), so pinning them costs no layout.
 *
 * 🚨 **MOUNTING THIS INSIDE A DISMISS-ON-OUTSIDE-CLICK CONTAINER? FIX THE
 * CONTAINER FIRST.** The peek renders through `ResourcePeekHost` → a Radix
 * `Dialog`, which PORTALS to `document.body` — outside your popover's ref. A
 * hand-rolled `document.addEventListener("mousedown", …)` +
 * `ref.contains(e.target)` therefore treats the first click inside the peek as
 * "outside", closes the popover, unmounts this component, and takes `peekOpen`
 * with it: the preview disappears mid-click, and the peek's own "Open" link
 * never fires at all, because the node is gone before `click` is dispatched.
 * A door that deletes itself when used is worse than no door. The container
 * must ignore events whose target is inside a dialog:
 *
 *     if (target?.closest?.('[role="dialog"], [role="alertdialog"]')) return;
 *
 * Shipped exactly this way on `/lists/v2` (2026-08-09) and caught by an
 * adversarial pass, NOT by type-check — it is statically decidable, so do not
 * file it as "needs a browser". 25 hand-rolled dismissers exist across 23
 * files; each is this trap waiting for a door to be added to it.
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 *   route → `hrefFor` in `features/scopes/registry/entityRegistry.ts`
 *   peek  → `features/organizations/peek/registry.ts` + `kinds-list.ts`
 */

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Lightbulb } from "lucide-react";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { cn } from "@/lib/utils";
import { resolveEntityDoors } from "./doors";

export const ENTITY_DOOR_CONTROL_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground";

export interface EntityDoorControlsProps {
  /** Canonical entity token (`agent`, `note`, `task`, …). */
  token: string;
  /** The record's id. */
  id: string;
  /** Display name — used only for the control labels/tooltips. */
  name?: string | null;
  /**
   * Override the registry route. Honoured exactly: `null` means "this record
   * has no door" and must not fall through to the registry; omit to defer.
   */
  href?: string | null;
  /** Hide the peek control even when one is registered. */
  disablePeek?: boolean;
  /** Hide the new-tab control. */
  disableNewTab?: boolean;
  /** Also render a same-tab Open control (off by default — see the header). */
  showOpen?: boolean;
  /** Controls stay visible instead of appearing on hover/focus. */
  alwaysShowActions?: boolean;
  /** Surface-specific extra doors (open in window, jump to versions, …). */
  extraActions?: React.ReactNode;
  className?: string;
}

export function EntityDoorControls({
  token,
  id,
  name,
  href,
  disablePeek = false,
  disableNewTab = false,
  showOpen = false,
  alwaysShowActions = false,
  extraActions,
  className,
}: EntityDoorControlsProps) {
  const [peekOpen, setPeekOpen] = useState(false);

  const doors = resolveEntityDoors(token, id, href);
  const resolvedHref = doors.href;
  const canPeek = !disablePeek && doors.canPeek;
  const label = name?.trim() || `${id.slice(0, 8)}…`;

  // Nothing to offer → render no chrome at all. A control that goes nowhere is
  // the dead end this whole module exists to kill.
  if (!canPeek && !resolvedHref && !extraActions) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5",
          !alwaysShowActions &&
            "opacity-0 transition-opacity group-hover/entity-ref:opacity-100 group-hover:opacity-100 focus-within:opacity-100",
          className,
        )}
      >
        {canPeek && (
          <button
            type="button"
            title={`Quick look at ${label}`}
            aria-label={`Quick look at ${label}`}
            onClick={(e) => {
              stop(e);
              setPeekOpen(true);
            }}
            className={ENTITY_DOOR_CONTROL_CLASS}
          >
            <Lightbulb className="h-3 w-3" />
          </button>
        )}
        {resolvedHref && showOpen && (
          <Link
            href={resolvedHref}
            onClick={stop}
            title={`Open ${label}`}
            aria-label={`Open ${label}`}
            className={ENTITY_DOOR_CONTROL_CLASS}
          >
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
        {resolvedHref && !disableNewTab && (
          <Link
            href={resolvedHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            title={`Open ${label} in a new tab`}
            aria-label={`Open ${label} in a new tab`}
            className={ENTITY_DOOR_CONTROL_CLASS}
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {extraActions}
      </span>

      {canPeek && peekOpen && (
        <ResourcePeekHost
          kind={doors.peekKind}
          id={id}
          onClose={() => setPeekOpen(false)}
          // Forward the CALLER's `href`, not our resolved one. When a caller
          // overrode it — because the token alone cannot say which surface
          // this record opens on — the dialog would otherwise send "Open"
          // somewhere our new-tab link does not go. Passing `resolvedHref`
          // here instead would set the override on EVERY peek, including the
          // ones where nobody overrode anything, and would then suppress the
          // hardcoded href a token-less bespoke peek supplies for itself.
          // `undefined` (no caller opinion) is the correct default.
          href={href}
        />
      )}
    </>
  );
}
