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
 */

import { Boxes } from "lucide-react";

import { ApplyDirectiveButton } from "@/features/matrx-envelope/ApplyDirectiveButton";
import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";

export interface EnvelopeFallbackCardProps {
  envelope: MatrxEnvelope;
  /** Short, human explanation of why the rich renderer degraded. */
  reason?: string;
}

export function EnvelopeFallbackCard({
  envelope,
  reason,
}: EnvelopeFallbackCardProps) {
  const count = Array.isArray(envelope.items) ? envelope.items.length : 0;
  return (
    <div className="my-3 inline-flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-sm">
      <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-foreground">{envelope.kind}</span>
      <span className="text-muted-foreground">/ {envelope.type}</span>
      <span className="text-muted-foreground">
        · {count} {count === 1 ? "item" : "items"}
      </span>
      {reason ? (
        <span className="text-muted-foreground">· {reason}</span>
      ) : null}
      {/* Degraded rendering never removes the user's ability to act on it. */}
      <ApplyDirectiveButton envelope={envelope} />
    </div>
  );
}

export default EnvelopeFallbackCard;
