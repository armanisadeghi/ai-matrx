"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ToolAccent } from "../../types";
import { EntityCard, type EntityAction } from "./EntityCard";

/**
 * EmptyResultCard — what a tool card renders when the call has RESULTED and
 * there is nothing to show.
 *
 * THE RULE (law 4, and the doctrine line in this feature's FEATURE.md): while a
 * tool is in flight, a renderer that returns `null` is correct — the shell's
 * shimmering line is the status. Once `isTerminal(entry)` is true, returning
 * `null` is a silent failure: the tool really ran, and the transcript shows no
 * trace of it at all.
 *
 * Live on 2026-09-14 that is exactly what happened. The chat agent called the
 * `document` tool, created a document, said «Created and opened as a document
 * artifact», and the reviewer's Activity feed was EMPTY — `DocumentInline`
 * returned `null` because the `create` result nests its row under `document`
 * and the parser only read the `read` shape. Six renderers shared that exact
 * shape (`if (!id && !name) return null`), so the fix is this one card, not six
 * bespoke fallbacks.
 *
 * The card says three things, always: what the tool DID, that there is nothing
 * to open from here, and the REMEDY — a real place the person can go.
 */
export function EmptyResultCard({
  icon,
  accent,
  title,
  /** Past-tense summary of what the tool did ("Created a document"). */
  did,
  /** Where the person can go instead. A sentence, usually carrying a link. */
  remedy,
  actions = [],
  expanded,
  onToggleExpanded,
}: {
  icon: LucideIcon;
  accent?: ToolAccent;
  title: string;
  did: string;
  remedy: ReactNode;
  actions?: EntityAction[];
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={icon}
      accent={accent}
      title={title}
      subtitle={`${did} · nothing to show`}
      actions={actions}
    >
      <div className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {did}, but the tool returned nothing to open from here. {remedy}
      </div>
    </EntityCard>
  );
}
