"use client";

// Map view — the platform at a glance: one card per Domain, visually weighted by
// its feature count, features as status-colored pills. Click any pill to edit.

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { NodeDialogState } from "./NodeDialog";
import { STATUS_STYLES, domainAccent, type TaxonomyTreeNode } from "./types";

interface MapProps {
  nodes: TaxonomyTreeNode[];
  onOpenDialog: (state: NodeDialogState) => void;
}

export default function TaxonomyMap({ nodes, onOpenDialog }: MapProps) {
  const maxFeatures = Math.max(1, ...nodes.map((d) => d.children.length));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {nodes.map((domain, index) => {
        const weight = domain.children.length / maxFeatures;
        const accent = domainAccent(domain.slug);
        const entityTotal =
          domain.entity_count +
          domain.children.reduce(
            (sum, f) =>
              sum +
              f.entity_count +
              f.children.reduce((s, sub) => s + sub.entity_count, 0),
            0,
          );
        return (
          <motion.div
            key={domain.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
            className={cn(
              "flex flex-col rounded-2xl border bg-gradient-to-br p-4",
              accent,
              weight > 0.66 && "sm:col-span-2 xl:col-span-1",
            )}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenDialog({ mode: "edit", node: domain })}
                className="truncate text-left text-base font-semibold hover:underline"
                title={`Edit ${domain.name}`}
              >
                {domain.name}
              </button>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  STATUS_STYLES[domain.status].badge,
                )}
              >
                {STATUS_STYLES[domain.status].label}
              </span>
            </div>
            <div className="mb-3 text-[11px] text-muted-foreground">
              {domain.children.length} features
              {entityTotal > 0 && <> · {entityTotal} entities</>}
              {domain.notes && (
                <span className="mt-0.5 line-clamp-1 block italic">{domain.notes}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domain.children.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => onOpenDialog({ mode: "edit", node: feature })}
                  title={[
                    feature.slug,
                    STATUS_STYLES[feature.status].label,
                    feature.entity_count > 0 ? `${feature.entity_count} entities` : null,
                    feature.children.length > 0
                      ? `${feature.children.length} sub-features`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm transition-transform hover:scale-105",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      STATUS_STYLES[feature.status].dot,
                    )}
                  />
                  {feature.name}
                  {feature.children.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{feature.children.length}
                    </span>
                  )}
                </button>
              ))}
              {domain.children.length === 0 && (
                <span className="text-xs italic text-muted-foreground">
                  No features yet
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
