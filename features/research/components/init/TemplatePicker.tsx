"use client";

import { cn } from "@/lib/utils";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { FileText, Loader2 } from "lucide-react";
import { useResearchTemplates } from "../../hooks/useResearchState";
import type { ResearchTemplate } from "../../types";
import { keywordTemplatesFromJson } from "../../types";

interface TemplatePickerProps {
  selected: ResearchTemplate | null;
  onSelect: (template: ResearchTemplate | null) => void;
}

export function TemplatePicker({ selected, onSelect }: TemplatePickerProps) {
  const { data: templates, isLoading, error, refresh } = useResearchTemplates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading templates...
      </div>
    );
  }

  const items = templates ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {error && items.length === 0 && (
        <ReadFailure
          error={error}
          what="the research templates"
          className="m-0 sm:col-span-2"
          onRetry={refresh}
        />
      )}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "rounded-xl border-2 border-dashed p-4 text-left text-foreground transition-colors min-h-[44px]",
          !selected
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/30",
        )}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground">
            {/* read-gate-exempt: the "start from scratch" option's label, not an empty list; a failed template read shows ReadFailure above */}
            No Template
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Start from scratch with your own keywords and settings.
        </p>
      </button>

      {items.map((template) => {
        const previewKws = keywordTemplatesFromJson(template.keyword_templates);
        return (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className={cn(
              "rounded-xl border-2 p-4 text-left text-foreground transition-colors min-h-[44px]",
              selected?.id === template.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30",
            )}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-sm text-foreground">
                {template.name}
              </span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {template.description}
              </p>
            )}
            {previewKws.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {previewKws.slice(0, 3).map((kw) => (
                  <span
                    key={kw}
                    className="text-[10px] bg-muted text-foreground rounded-full px-2 py-0.5"
                  >
                    {kw}
                  </span>
                ))}
                {previewKws.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{previewKws.length - 3}
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
