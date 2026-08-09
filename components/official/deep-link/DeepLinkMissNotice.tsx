"use client";

/**
 * DeepLinkMissNotice — what a surface shows when a deep link names a record it
 * cannot display.
 *
 * THE DEAD END this kills: a link arrives as `?category=<id>`, the id does not
 * resolve (deleted, not in this scope, mistyped), and the surface renders its
 * ordinary empty state. The address bar still names a record, the panel says
 * "nothing selected", and the user is told nothing — the link looks valid and
 * silently does nothing. Bugbot found this same shape on three separate
 * surfaces in one campaign wave (`?user=` on the admins roster, `?category=` on
 * agent-app categories, `?block=` on content blocks), which is what turned it
 * from a per-page patch into a primitive.
 *
 * Two things every one of those sites owed the user, and neither is an error
 * message:
 *
 *   1. **Say what happened** — the record is not in THIS list, which is not the
 *      same as "no results match your filters". Blaming a filter for a missing
 *      record sends the user to clear filters that were never the problem.
 *   2. **Offer the doors anyway** — "we can't show it here" does not mean "we
 *      can't reach it". If the token resolves, peek and new-tab still open the
 *      record where it does live. A problem you can detect ships with its fix.
 *
 * Plus the one-click escape (`onClear`) so the stale param does not persist.
 * Pair with `useDeepLinkParam`, which supplies a `clear` that preserves sibling
 * params and routes through `router.replace`.
 *
 * When the surface ALSO renders an empty state, condition it on the same flag —
 * two components contradicting each other about why the list is empty is worse
 * than either alone.
 */

import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";

export interface DeepLinkMissNoticeProps {
  /** Canonical entity token the param names (`agent`, `note`, `app_category`…). */
  token: string;
  /** The id that did not resolve. Shown verbatim — never truncated away. */
  id: string;
  /**
   * The word for this record in the sentence ("category", "content block").
   * Only needed when the token is not registered — a registered one already
   * carries `labelPlural`, and hardcoding a word beside a registry that owns it
   * is how the two drift apart.
   */
  entityLabel?: string;
  /**
   * What the user is actually looking at, in their words: "roster",
   * "category list", "blocks in this app". Defaults to "list".
   */
  containerLabel?: string;
  /**
   * Override the registry route. Honoured exactly by `resolveEntityDoors`, so
   * `null` means "this record genuinely has no door" and must not fall through.
   * Pass it when the entity has a real page but no registry token yet — `user`
   * is the live example (`accountHrefFor`), and it is exactly the case where the
   * user most needs somewhere to go.
   */
  href?: string | null;
  /** Drop the param. Use `useDeepLinkParam(...).clear`. */
  onClear: () => void;
  className?: string;
}

export function DeepLinkMissNotice({
  token,
  id,
  entityLabel,
  containerLabel = "list",
  href,
  onClear,
  className,
}: DeepLinkMissNoticeProps) {
  // Singular label. A registered token supplies it; an unregistered one falls
  // back to its own name with the underscores taken out, so the sentence still
  // reads as English ("app_category" → "app category") rather than leaking a
  // developer identifier at the user — which is the same class of defect this
  // component exists to remove.
  const info = tryGetEntityInfo(token);
  const plural = info?.labelPlural ?? token.replace(/_/g, " ");
  const derived = plural.endsWith("s") ? plural.slice(0, -1) : plural;
  const noun = (entityLabel ?? derived).toLowerCase();
  const article = /^[aeiou]/.test(noun) ? "an" : "a";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
        <span className="min-w-0">
          This link points at {article} {noun} that is not in this{" "}
          {containerLabel} — it may have been deleted, or it may sit outside what
          this view loads.{" "}
          <code className="rounded bg-muted px-1 text-xs">{id}</code>
        </span>
        {/* "Not here" is not "unreachable": if the token resolves, these still
            open the record where it does live. */}
        <EntityDoorControls
          token={token}
          id={id}
          href={href}
          alwaysShowActions
          className="shrink-0"
        />
      </div>
      <Button variant="outline" size="sm" onClick={onClear} className="shrink-0">
        Clear
      </Button>
    </div>
  );
}
