"use client";

/**
 * toastDoor — the door for a record a TOAST just told you about.
 *
 * THE DEAD END this kills: "Note created", "Duplicated", "Reassigned 5
 * resources". The app just made or changed a specific record, had its id in
 * hand, and the only thing the user can do about it is watch the toast fade.
 * Finding the thing again means going back to a list and hunting for it.
 *
 * Sonner's `action` accepts a ReactNode as well as `{label, onClick}`, so the
 * door is a real `<Link>`, NOT a button with an onClick. That matters: an
 * anchor gives same-tab Open, cmd-click and middle-click new-tab, and a
 * copyable target — three of the four doors — where an onClick gives exactly
 * one and steals the rest. Never "fix" this into a button.
 *
 *     toast.success("Note created", { action: toastDoor("note", id) })
 *
 * Returns `undefined` when the token has no route, so the spread above is safe
 * everywhere: a toast about an unreachable record simply has no action, rather
 * than a control that goes nowhere.
 *
 * Peek is deliberately NOT offered. A toast is transient and usually
 * off-center; a preview that outlives its trigger is a worse affordance than a
 * link. Adding a door for a new entity type is a registry edit
 * (`hrefFor` in `features/scopes/registry/entityRegistry.ts`), never a change
 * here.
 */

import React from "react";
import Link from "next/link";
import { resolveEntityDoors } from "./doors";

export interface ToastDoorOptions {
  /** Button text. Defaults to "Open". */
  label?: string;
  /**
   * Override the registry route. Honoured exactly: `null` means "no door" and
   * must not fall through to the registry.
   */
  href?: string | null;
}

export function toastDoor(
  token: string,
  id: string | null | undefined,
  options: ToastDoorOptions = {},
): React.ReactNode | undefined {
  if (!id) return undefined;

  const { href } = resolveEntityDoors(token, id, options.href);
  if (!href) return undefined;

  return (
    <Link
      href={href}
      className="shrink-0 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {options.label ?? "Open"}
    </Link>
  );
}
