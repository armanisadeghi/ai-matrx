"use client";

/**
 * The neutral "we could not render this, but we will NEVER hide it" card.
 *
 * THE RULE THIS EXISTS TO ENFORCE: **a registered envelope renderer must never
 * return `null`.** `MatrxEnvelopeBlock` delegates to whatever the registry
 * returns and renders its output verbatim — so a renderer that bails with
 * `null` deletes the assistant's entire message block from the UI, on first
 * paint and on every reload, with no error anywhere.
 *
 * That is not hypothetical (2026-07-26): `plan_tree` items addressed by
 * plain-text `site` (instead of `site_id`) parsed to an empty list, the
 * renderer returned `null`, and a 70KB content plan — prose included —
 * vanished permanently while sitting intact in the database.
 *
 * So: when a renderer cannot draw its rich view, it renders THIS instead.
 * Content survives, the user sees that something arrived, and `reason` says
 * why it degraded.
 *
 * It is also THE PREFIX FLOOR of the Kind Directives route: a slug whose class
 * has no registered renderer lands here, named by its class and noun, with an
 * Apply button when the class is a side effect. A shape the frontend has never
 * heard of is still legible and still actionable.
 */

import { Boxes } from "lucide-react";

import type { DecodedDirective } from "@/features/content-ir/directives/decode";
import { directiveDisplay } from "@/features/content-ir/directives/nounDisplay";
import { ApplyDirectiveButton } from "@/features/matrx-envelope/ApplyDirectiveButton";

export interface EnvelopeFallbackCardProps {
  directive: DecodedDirective;
  /** Short, human explanation of why the rich renderer degraded. */
  reason?: string;
}

export function EnvelopeFallbackCard({
  directive,
  reason,
}: EnvelopeFallbackCardProps) {
  const count = directive.items.length;
  // THE AUTO-VIEW: the catalog names the shape, so a noun this frontend has
  // never heard of still reads as "Create Agent · Agents" rather than as a slug.
  const display = directiveDisplay(directive.directiveClass, directive.noun);
  return (
    <div className="my-3 inline-flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-sm">
      <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-foreground">{display.title}</span>
      {display.family ? (
        <span className="text-muted-foreground">· {display.family}</span>
      ) : null}
      <span className="text-muted-foreground">
        · {count} {count === 1 ? "item" : "items"}
      </span>
      {reason ? (
        <span className="text-muted-foreground">· {reason}</span>
      ) : null}
      {/* Degraded rendering never removes the user's ability to act on it. */}
      <ApplyDirectiveButton directive={directive} />
    </div>
  );
}

export default EnvelopeFallbackCard;
