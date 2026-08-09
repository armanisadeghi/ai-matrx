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
 *   - preview                          → `ResourcePeekHost`
 *
 * Safe inside clickable table rows: every control stops propagation.
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 * give the token an `hrefFor` in `entityRegistry.ts`, and/or a peek in
 * `features/organizations/peek/registry.ts` + `kinds-list.ts`.
 */

import React, { useState } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { cn } from "@/lib/utils";
import { resolveEntityDoors } from "./doors";

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

const CONTROL_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground";

export function EntityRef({
  token,
  id,
  name,
  href,
  showIcon = true,
  disablePeek = false,
  disableNewTab = false,
  alwaysShowActions = false,
  extraActions,
  className,
}: EntityRefProps) {
  const [peekOpen, setPeekOpen] = useState(false);

  const doors = resolveEntityDoors(token, id, href);
  const resolvedHref = doors.href;
  const peekKind = doors.peekKind;
  const canPeek = !disablePeek && doors.canPeek;
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
          className="min-w-0 truncate text-inherit underline-offset-2 hover:text-primary hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
      )}

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5",
          !alwaysShowActions &&
            "opacity-0 transition-opacity group-hover/entity-ref:opacity-100 focus-within:opacity-100",
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
            className={CONTROL_CLASS}
          >
            <Lightbulb className="h-3 w-3" />
          </button>
        )}
        {resolvedHref && !disableNewTab && (
          <Link
            href={resolvedHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            title={`Open ${label} in a new tab`}
            aria-label={`Open ${label} in a new tab`}
            className={CONTROL_CLASS}
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {extraActions}
      </span>

      {canPeek && peekOpen && (
        <ResourcePeekHost
          kind={peekKind}
          id={id}
          onClose={() => setPeekOpen(false)}
        />
      )}
    </span>
  );
}
