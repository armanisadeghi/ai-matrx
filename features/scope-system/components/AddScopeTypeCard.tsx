"use client";

import { Plus, LayoutTemplate } from "lucide-react";
import { Card } from "@/components/ui/card";

interface AddScopeTypeCardProps {
  onAddBlank: () => void;
  onPickTemplate: () => void;
}

/**
 * Action card used in place of a giant "Add" button at the top of the scopes
 * grid. Sits inside the same grid as ScopeTypeCard so the entry point feels
 * like one more tile rather than a heavy CTA. Two inline actions on the card:
 * a plain "Add scope" and "From a template".
 */
export function AddScopeTypeCard({
  onAddBlank,
  onPickTemplate,
}: AddScopeTypeCardProps) {
  return (
    <Card className="p-5 border-2 border-dashed border-border bg-card/40 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-4 h-full">
        <div className="w-12 h-12 rounded-lg text-muted-foreground flex items-center justify-center shrink-0">
          <Plus className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <button
            type="button"
            onClick={onAddBlank}
            className="text-left group"
          >
            <span className="text-sm font-semibold text-foreground group-hover:text-primary inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add scope
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define a fresh group from scratch
            </p>
          </button>
          <button
            type="button"
            onClick={onPickTemplate}
            className="text-left group"
          >
            <span className="text-sm font-semibold text-foreground group-hover:text-primary inline-flex items-center gap-1.5">
              <LayoutTemplate className="h-3.5 w-3.5" />
              From a template
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start with a preset like Clients or Models
            </p>
          </button>
        </div>
      </div>
    </Card>
  );
}
