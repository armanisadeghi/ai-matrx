"use client";

/**
 * The card for a SIDE-EFFECT directive in content — create / update / delete /
 * action. One component, registered for all four classes through the prefix
 * rule, so all 56 registered shapes get it and a brand-new server shape gets it
 * with ZERO frontend edits.
 *
 * WHY IT EXISTS (Arman, 2026-08-26):
 *
 * > "as it is, it's not really useful because all it's giving is a name and then
 * > an apply button, which essentially tells the user to click apply and conduct
 * > a potentially destructive action without any clue as to what this thing is."
 *
 * The floor it replaces (`EnvelopeFallbackCard`) was built to guarantee an
 * unknown shape is never DROPPED — a real and load-bearing job it keeps for
 * classes nothing registers. But a safety floor became the primary experience
 * for every action, and "never dropped" is not the same as "legible".
 *
 * THE DESIGN, and what each rule is protecting against:
 *
 *  - **Say what it IS, from authority.** The title is the catalog's own words
 *    ("Create Agent Definition"); each item is named by the noun's catalog
 *    `title_column`, never a guess (`itemSummary.ts`).
 *  - **Facts, not prose.** A few scalar chips. No description paragraph — a
 *    description in a card is a novel in a UI, and it is already in the panel.
 *  - **Nesting goes to the panel, never into the row.** One flat row per item.
 *    By the time a kind component renders it is already inside two containers;
 *    a third is how content becomes unreadable.
 *  - **Read before you approve.** `View` opens the item in a window panel that
 *    wraps the item's OWN kind component (THE DIRECTIVE⇄KIND SEAM) with a raw
 *    JSON tab — so an `agent_definition` proposal shows the real agent card,
 *    with no code here and none in the directive layer.
 *  - **Copy is table stakes**, at the batch and at the item.
 *  - **Apply stays exactly where it was** — same `POST /directives/confirm`,
 *    same idempotency — now pressed by someone who has seen the thing.
 *
 * NEVER RETURNS NULL. `MatrxEnvelopeBlock` renders a registered renderer's
 * output verbatim, so a null here deletes the assistant's whole message block
 * (2026-07-26: a 70KB content plan vanished exactly that way). A shape with no
 * items degrades to a stated, visible line.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Maximize2 } from "lucide-react";

import type { DecodedDirective } from "@/features/content-ir/directives/decode";
import { directiveDisplay } from "@/features/content-ir/directives/nounDisplay";
import {
  asKindInstance,
  directiveItemKind,
} from "@/features/content-ir/directives/itemKind";
import {
  itemFacts,
  itemSubtitle,
  itemTitle,
} from "@/features/content-ir/directives/itemSummary";
import { ApplyDirectiveButton } from "@/features/matrx-envelope/ApplyDirectiveButton";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useOpenDirectiveItemWindow } from "@/features/overlays/openers/directiveItemWindow";
import { classIcon } from "@/features/matrx-envelope/directives/sideEffect/classIcon";
import { cn } from "@/lib/utils";

export interface SideEffectDirectiveCardProps {
  directive: DecodedDirective;
}

/** How many items render as rows before the rest collapse behind a toggle. */
const ROWS_BEFORE_FOLD = 3;

function ItemRow({
  directive,
  item,
  index,
  total,
}: {
  directive: DecodedDirective;
  item: Record<string, unknown>;
  index: number;
  total: number;
}) {
  const openItem = useOpenDirectiveItemWindow();
  const title = itemTitle(item, directive.noun, index, total);
  const subtitle = itemSubtitle(item);
  const facts = itemFacts(item);
  const kind = directiveItemKind(directive.slug);
  const display = directiveDisplay(directive.directiveClass, directive.noun);

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <button
        type="button"
        onClick={() =>
          openItem({
            // Stamped so the panel's kind pipeline types it from its own first
            // key, exactly like any other kind instance on the wire.
            item: asKindInstance(directive.slug, item) ?? item,
            itemKind: kind,
            title,
            subtitle: `${display.title} · item ${index + 1} of ${total}`,
          })
        }
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent hover:text-accent-foreground"
        title="Open to read it"
      >
        <span className="truncate font-medium text-foreground">{title}</span>
        {facts.map((fact) => (
          <span
            key={fact.key}
            className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline"
          >
            {fact.value} {fact.label}
          </span>
        ))}
        {subtitle && facts.length === 0 ? (
          <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
            {subtitle}
          </span>
        ) : null}
        <Maximize2 className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <CopyButtons
        label={title}
        human={() => JSON.stringify(item, null, 2)}
        agent={{
          kind: kind ?? `${directive.directiveClass}-item`,
          location: "AI Matrx — proposed directive item",
          description: `One item of a pending ${display.title} directive${
            kind ? ` (kind: ${kind})` : ""
          }. Not yet applied.`,
          data: item,
          attributes: { directive: directive.slug, index: index + 1, of: total },
        }}
        json={item}
        size="xs"
        appearance="bare"
      />
    </div>
  );
}

export function SideEffectDirectiveCard({
  directive,
}: SideEffectDirectiveCardProps) {
  const [expanded, setExpanded] = useState(false);
  const items = directive.items;
  const total = items.length;
  const display = directiveDisplay(directive.directiveClass, directive.noun);
  const Icon = classIcon(directive.directiveClass, directive.noun);

  const shown = expanded ? items : items.slice(0, ROWS_BEFORE_FOLD);
  const hidden = total - shown.length;

  return (
    <div className="my-3 rounded-md border border-border bg-card px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">
          {display.title}
        </span>
        {display.family ? (
          <span className="text-xs text-muted-foreground">{display.family}</span>
        ) : null}
        <span className="text-xs tabular-nums text-muted-foreground">
          {total} {total === 1 ? "item" : "items"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButtons
            label={display.title}
            human={() => JSON.stringify(directive.shell, null, 2)}
            agent={{
              kind: "matrx-directive",
              location: "AI Matrx — pending directive in a conversation",
              description: `A ${display.title} directive carrying ${total} item(s), proposed but NOT yet applied.`,
              data: directive.shell,
              attributes: {
                directive: directive.slug,
                class: directive.directiveClass,
                items: total,
              },
            }}
            json={directive.shell}
            size="icon"
            appearance="bare"
          />
          <ApplyDirectiveButton directive={directive} itemCount={total} />
        </div>
      </div>

      {total === 0 ? (
        // Stated, never silent: an empty batch is a real (and suspicious) state.
        <p className="mt-1 text-xs text-muted-foreground">
          No items — nothing would be written.
        </p>
      ) : (
        <div className="mt-0.5 divide-y divide-border/60">
          {shown.map((item, i) => (
            <ItemRow
              key={i}
              directive={directive}
              item={item}
              index={i}
              total={total}
            />
          ))}
        </div>
      )}

      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 rounded px-1 py-0.5",
            "text-[11px] text-muted-foreground hover:text-foreground",
          )}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          )}
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

export default SideEffectDirectiveCard;
