"use client";

/**
 * THE RELATIONSHIP RULE'S ACTIONS — ONE definition of "what you can do to a
 * platform.relationship_rules row", shared by every Relationships-hub surface
 * that shows one (mirrors `features/crm/components/crm-row-actions.tsx`).
 *
 * Today: `RelationshipRulesClient` (the registry table). `EntityRelationshipOrbit`
 * (the orbit diagram card) renders the same identity and is a future adopter —
 * see the registry note in `features/context-menu-v3/SECTIONS.md`.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Edit/Delete delegate to the page's own
 * `openEditInSidePanel` / delete-confirm state — this module only describes
 * the row and its readable text.
 *
 * No `entityRef`: `platform.relationship_rules` has a composite key
 * (source_type, target_type, label) and no registered `entity_types` token —
 * there is nothing for Attach To / Share to point at, so both correctly stay
 * absent rather than faked.
 */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type {
  ContextMenuExtraSection,
  ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import { label, ruleKey, ruleSentence } from "../utils";
import type { RelationshipRule } from "../types";

export interface RelationshipRuleMenu {
  /** Hand straight to `NonEditableContextMenu.resolveContextOnOpen`. */
  resolveContextOnOpen: (
    target: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  /** Hand straight to `NonEditableContextMenu.extraSections`. */
  sections: ContextMenuExtraSection[];
  /** The rule the menu is open on. */
  rule: RelationshipRule | null;
}

export interface RelationshipRuleMenuOptions {
  /** The rows currently on screen, read at open time (never captured). */
  rules: () => RelationshipRule[];
  onEdit: (rule: RelationshipRule) => void;
  /** Omit on a read-only surface (e.g. the orbit diagram). */
  onDelete?: (rule: RelationshipRule) => void;
}

function ruleContent(rule: RelationshipRule): string {
  return [
    `${label(rule.source_type)} → ${label(rule.target_type)}${rule.label ? ` (${rule.label})` : ""}`,
    ruleSentence(rule),
    `active=${rule.is_active} conveys=${rule.conveys_max} container_side=${rule.container_side}`,
  ].join("\n");
}

export function useRelationshipRuleMenu(
  opts: RelationshipRuleMenuOptions,
): RelationshipRuleMenu {
  const [rule, setRule] = useState<RelationshipRule | null>(null);

  const resolveContextOnOpen = (target: HTMLElement | null) => {
    const key = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const next =
      (key && opts.rules().find((r) => ruleKey(r) === key)) || null;
    setRule(next);
    if (!next) return null;
    return { content: ruleContent(next) };
  };

  const items: ContextMenuExtraSection["items"] = [
    {
      kind: "item",
      id: "relationship-rule-edit",
      label: "Edit rule…",
      icon: Pencil,
      disabled: !rule,
      onSelect: () => rule && opts.onEdit(rule),
    },
  ];
  if (opts.onDelete) {
    items.push({
      kind: "item",
      id: "relationship-rule-delete",
      label: "Delete rule…",
      icon: Trash2,
      destructive: true,
      disabled: !rule,
      onSelect: () => rule && opts.onDelete!(rule),
    });
  }

  const sections: ContextMenuExtraSection[] = [
    {
      id: "relationship-rule-row",
      label: rule
        ? `${label(rule.source_type)} → ${label(rule.target_type)}`
        : "This rule",
      anchor: "after-compare",
      items,
    },
  ];

  return { resolveContextOnOpen, sections, rule };
}
