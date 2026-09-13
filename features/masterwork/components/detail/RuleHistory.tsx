"use client";

/**
 * "What this rule used to say" — the positions a machine replaced, kept.
 *
 * 🚨 Arman's expertise mandate (2026-09-12): "Surface, retain, and make
 * navigable divergent approaches, dissent, and controversy… without collapsing
 * them into consensus."
 *
 * The interview lane's best moment used to produce the wrong artifact: it
 * caught a real cross-turn contradiction, and resolved it by rewriting the
 * existing rule in place to carry "the real line". One merged rule survived,
 * and nothing recorded that the Expert had ever held the earlier position.
 *
 * The server now keeps the replaced words on the rule itself
 * (`rulebook_writes.push_rule_history`). This is the door to them: folded away,
 * because it is a record and not a question — nothing here is waiting on the
 * Expert, and nothing here is a defect. Absent entirely on a rule no machine
 * has ever rewritten.
 */

import { useState } from "react";
import { History } from "lucide-react";

import type { RulebookRule } from "../../types";

function whenText(iso: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString();
}

export function RuleHistory({ rule }: { rule: RulebookRule }) {
  const entries = rule.history ?? [];
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
      >
        <History className="h-3 w-3" />
        {entries.length === 1
          ? "Earlier position (1)"
          : `Earlier positions (${entries.length})`}
      </button>
      {open ? (
        <ul className="space-y-1.5 border-l-2 border-border pl-2">
          {/* Newest replacement first — the position closest to today's rule. */}
          {[...entries].reverse().map((entry, index) => (
            <li key={`${entry.changed_at}-${index}`} className="text-xs">
              <p className="italic text-foreground">“{entry.statement}”</p>
              <p className="text-muted-foreground">
                {entry.reason ? `Changed because ${entry.reason}` : "Rewritten"}
                {whenText(entry.changed_at)
                  ? ` — ${whenText(entry.changed_at)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
