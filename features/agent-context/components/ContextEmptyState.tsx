"use client";

import { Database, Plus, LayoutTemplate, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type EmptyStateProps = {
  variant: "no-items" | "no-results";
  onClearFilters?: () => void;
};

export function ContextEmptyState({
  variant,
  onClearFilters,
}: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium mb-1">
          No items match your filters
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Try adjusting your search or filter criteria
        </p>
        {onClearFilters && (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-5">
        <Database className="h-8 w-8 text-primary/40" />
      </div>
      <h3 className="text-base font-semibold mb-1.5">No context items yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Context items let AI agents know about your client, project, or
        organization without re-explaining every time.
      </p>
      <div className="flex gap-3">
        <Button size="sm" className="gap-1.5" asChild>
          <Link href="/agent-context/items/new">
            <Plus className="h-3.5 w-3.5" />
            Create your first item
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href="/agent-context/templates">
            <LayoutTemplate className="h-3.5 w-3.5" />
            Start from a template
          </Link>
        </Button>
      </div>
    </div>
  );
}
