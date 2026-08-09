"use client";

/**
 * EntityRef — THE way to render a reference to another record.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it. This
 * component is that law made importable — drop it anywhere a name, a title, or
 * (worse) a bare id is being printed, and the user gets every door we can open:
 *
 *   Open      → click the name; canonical route from the entity registry
 *   New tab   → explicit control, so a user deep inside a console/modal never
 *               has to trade their current state for an answer
 *   Peek      → non-blocking preview via the peek registry, when one exists
 *   (Window)  → surfaces pass their own opener through `extraActions`
 *
 * It composes primitives, it does not duplicate them:
 *   - route + icon + peek availability → `resolveEntityDoors` (./doors)
 *   - the control cluster + preview    → `EntityDoorControls`
 *
 * Safe inside clickable table rows: every control stops propagation.
 *
 * When the name genuinely CANNOT be an anchor — it is an inline editor, or it
 * lives inside a `<button>` that means something else — render
 * `<EntityDoorControls>` as a SIBLING of the name instead. Same doors, no
 * invalid nesting.
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 * give the token an `hrefFor` in `entityRegistry.ts`, and/or a peek in
 * `features/organizations/peek/registry.ts` + `kinds-list.ts`.
 */

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveEntityDoors } from "./doors";
import { EntityDoorControls } from "./EntityDoorControls";

export interface EntityRefProps {
  /** Canonical entity token (`agent`, `note`, `task`, …). */
  token: string;
  /** The record's id. */
  id: string;
  /**
   * Display name. When omitted the id is shown truncated — acceptable only
   * when the name genuinely isn't loaded; prefer passing it.
   */
  name?: string | null;
  /** Override the registry route (e.g. an admin-side route for the same record). */
  href?: string;
  /** Show the entity's registry icon before the name. Default true. */
  showIcon?: boolean;
  /**
   * Classes for the NAME itself (the anchor / fallback span). The default is a
   * single truncated line, which is right for a table cell and wrong for a card
   * tile whose title is allowed to wrap. Pass e.g.
   * `"whitespace-normal line-clamp-3"` so a card keeps its layout after the
   * name becomes a door — the alternative (hand-rolling the anchor) is what
   * this component exists to stop.
   */
  nameClassName?: string;
  /** Hide the peek control even when one is registered. */
  disablePeek?: boolean;
  /** Hide the new-tab control (rare — only when the row is already a link). */
  disableNewTab?: boolean;
  /** Controls stay visible instead of appearing on hover/focus. */
  alwaysShowActions?: boolean;
  /** Surface-specific extra doors (open in window, jump to versions, …). */
  extraActions?: React.ReactNode;
  className?: string;
}

export function EntityRef({
  token,
  id,
  name,
  href,
  showIcon = true,
  nameClassName,
  disablePeek = false,
  disableNewTab = false,
  alwaysShowActions = false,
  extraActions,
  className,
}: EntityRefProps) {
  const doors = resolveEntityDoors(token, id, href);
  const resolvedHref = doors.href;
  const label = name?.trim() || `${id.slice(0, 8)}…`;
  const Icon = doors.Icon;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span
      className={cn(
        "group/entity-ref inline-flex min-w-0 max-w-full items-center gap-1",
        className,
      )}
    >
      {showIcon && Icon && (
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}

      {resolvedHref ? (
        <Link
          href={resolvedHref}
          onClick={stop}
          title={`Open ${label}`}
          className={cn(
            "min-w-0 truncate text-inherit underline-offset-2 hover:text-primary hover:underline",
            nameClassName,
          )}
        >
          {label}
        </Link>
      ) : (
        <span className={cn("min-w-0 truncate", nameClassName)} title={label}>
          {label}
        </span>
      )}

      <EntityDoorControls
        token={token}
        id={id}
        name={label}
        href={resolvedHref}
        disablePeek={disablePeek}
        disableNewTab={disableNewTab}
        alwaysShowActions={alwaysShowActions}
        extraActions={extraActions}
      />
    </span>
  );
}
