"use client";

/**
 * ItemPresentationBlock — the renderer for the `item_presentation` JSON block.
 *
 * Lifecycle the user experiences:
 *   1. The block is recognized → a pretty card appears INSTANTLY (even mid-stream,
 *      from a partial JSON scan).
 *   2. The `type` resolves → the card adopts that type's icon + accent and, for
 *      recognized + enrichable types, kicks off a DB fetch immediately.
 *   3. Enrichment lands → the authoritative name/about replace the agent's guess
 *      and detail rows smoothly grow into view.
 *   4. Click → recognized & openable types launch the matching window panel.
 *
 * Forgiving by design: unknown/misspelled types render the neutral fallback
 * card, a missing DB row shows a subtle "not found" note, and nothing ever
 * throws.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Loader2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { getItemConfig } from "./registry";
import { parseItemPresentation } from "./parseItemPresentation";
import { useEnrichItem } from "./useEnrichItem";
import { useOpenItemPresentation } from "./useOpenItemPresentation";

interface ItemPresentationBlockProps {
  content: string;
  isStreamActive?: boolean;
}

const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={cn(
      "inline-block animate-pulse rounded bg-zinc-300/70 dark:bg-zinc-700/70 align-middle",
      className,
    )}
  />
);

const ItemPresentationBlock: React.FC<ItemPresentationBlockProps> = ({
  content,
  isStreamActive,
}) => {
  const { payload } = parseItemPresentation(content);
  const { config, recognized } = getItemConfig(payload.type);
  const { status, data } = useEnrichItem(payload.type, payload.id);

  const open = useOpenItemPresentation();
  const [hovered, setHovered] = useState(false);

  const Icon = config.icon;
  const name = data?.name ?? payload.name ?? undefined;
  const about = data?.about ?? payload.about ?? undefined;
  const details = data?.details ?? [];
  const notFound = status === "not-found";
  const enriching = status === "loading";

  // Openable when the type is recognized, has a wired opener, and we have an
  // id. We intentionally DO NOT gate on `notFound` — our enrichment read may be
  // blocked by RLS while the window panel itself has access, and the user may
  // simply want to try opening it.
  const canOpen = recognized && !!config.open && !!payload.id;

  // No type yet (still streaming the opening keys) → a soft skeleton card that
  // already has the final shape, so the swap to the real card is seamless.
  const awaitingType = !payload.type && isStreamActive;

  const handleClick = () => {
    if (canOpen) open(payload.type, payload.id, { name, about });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!canOpen) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="my-3"
    >
      <div
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKey}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group relative w-full max-w-xl overflow-hidden rounded-xl border bg-card text-left",
          "border-border/70 ring-1 ring-inset transition-all duration-200",
          config.accent.ring,
          canOpen &&
            "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-md",
        )}
      >
        {/* subtle accent wash behind the icon */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-24 opacity-60",
            config.accent.bg,
            "[mask-image:linear-gradient(to_right,black,transparent)]",
          )}
        />

        <div className="relative flex items-start gap-3 p-3.5">
          {/* Icon chip */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              config.accent.bg,
              config.accent.ring,
            )}
          >
            {awaitingType ? (
              <Loader2
                className={cn("h-5 w-5 animate-spin", config.accent.text)}
              />
            ) : (
              <Icon className={cn("h-5 w-5", config.accent.text)} />
            )}
          </div>

          {/* Main column */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {name ? (
                  name
                ) : awaitingType || enriching ? (
                  <Shimmer className="h-4 w-32" />
                ) : (
                  <span className="text-muted-foreground">
                    Untitled {config.label}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
                  config.accent.bg,
                  config.accent.text,
                  config.accent.ring,
                )}
              >
                {config.label}
              </span>
              {enriching && (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* About line */}
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {about ? (
                <span className="line-clamp-2">{about}</span>
              ) : awaitingType || enriching ? (
                <Shimmer className="mt-1 h-3 w-48" />
              ) : notFound ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  Not found — it may have been moved or deleted.
                </span>
              ) : !recognized ? (
                <span>A {config.label.toLowerCase()} reference.</span>
              ) : null}
            </div>

            {/* Enriched detail rows — these are the part that "grows in" */}
            <AnimatePresence initial={false}>
              {details.length > 0 && (
                <motion.div
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {details.map((d, i) => (
                      <span
                        key={`${d.label}-${i}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <span className="font-medium text-foreground/70">
                          {d.label}:
                        </span>
                        {d.value}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Open affordance */}
          {canOpen && (
            <div
              className={cn(
                "shrink-0 self-center rounded-md p-1.5 text-muted-foreground transition-all",
                hovered && "bg-muted text-foreground",
              )}
              aria-hidden
            >
              <ArrowUpRight className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ItemPresentationBlock;
