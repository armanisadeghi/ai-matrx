"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Star, Loader2, Archive, ArchiveRestore } from "lucide-react";

interface TemplateCardProps {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isFeatured: boolean;
  useCount: number;
  /** Archived templates stay usable; the badge is what stops the card lying. */
  isArchived?: boolean;
  onUseTemplate?: (id: string) => void;
  /** Absent when this person may not edit the template (row security would refuse). */
  onArchive?: (id: string, name: string) => void;
  onRestore?: (id: string, name: string) => void;
  isArchiving?: boolean;
  onNavigate?: (id: string, path: string) => void;
  isNavigating?: boolean;
  isUsingTemplate?: boolean;
  isAnyProcessing?: boolean;
}

export function TemplateCard({
  id,
  name,
  description,
  category,
  isFeatured,
  useCount,
  isArchived,
  onUseTemplate,
  onArchive,
  onRestore,
  isArchiving,
  onNavigate,
  isNavigating,
  isUsingTemplate,
  isAnyProcessing,
}: TemplateCardProps) {
  const handleView = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (onNavigate && !isAnyProcessing) {
      onNavigate(id, `/agents/templates/${id}`);
    }
  };

  const handleUseTemplate = () => {
    if (onUseTemplate && !isAnyProcessing) {
      onUseTemplate(id);
    }
  };

  const isDisabled = isAnyProcessing || false;
  const showLoadingOverlay = isNavigating || isUsingTemplate || isArchiving;

  return (
    <Card
      className={`flex flex-col h-full bg-card border border-border transition-all duration-200 overflow-hidden relative ${
        isDisabled ? "opacity-60" : "hover:shadow-md"
      }`}
    >
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="type-title text-foreground">
              {isNavigating ? "Loading..." : isArchiving ? (isArchived ? "Restoring..." : "Archiving...") : "Creating Agent..."}
            </span>
          </div>
        </div>
      )}

      <div className="p-6 flex-1">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground line-clamp-2 flex-1">
            {name || "Untitled Template"}
          </h3>
          {isFeatured && (
            <Star className="h-5 w-5 text-warning flex-shrink-0 ml-2" />
          )}
        </div>

        {description && (
          <p className="type-body text-muted-foreground mb-4 line-clamp-3">
            {description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {isArchived && (
            <Badge variant="outline" className="text-muted-foreground border-border">
              Archived
            </Badge>
          )}
          {category && (
            <Badge variant="secondary" className="bg-primary/10 text-primary-ink">
              {category}
            </Badge>
          )}
          {useCount > 0 && (
            <Badge
              variant="outline"
              className="text-muted-foreground border-border"
            >
              {useCount} uses
            </Badge>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4 bg-muted rounded-b-lg">
        <div className="flex flex-wrap gap-2 justify-center">
          <Link
            href={`/agents/templates/${id}`}
            tabIndex={-1}
            onClick={(e) => handleView(e)}
            className="flex-1 min-w-[6.5rem]"
          >
            <Button
              icon={isNavigating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Eye />
              )}
              type="submit"
              variant="outline"
              disabled={isDisabled}
              className="w-full"
            >
              View
            </Button>
          </Link>
          <Button
            icon={isUsingTemplate ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Copy />
            )}
            variant="primary"
            onClick={handleUseTemplate}
            disabled={isDisabled}
            className="flex-1 min-w-[6.5rem]"
          >
            Use Template
          </Button>
          {(isArchived ? onRestore : onArchive) && (
            <Button
              variant="outline"
              size="icon"
              icon={isArchived ? <ArchiveRestore /> : <Archive />}
              aria-label={isArchived ? "Restore template" : "Archive template"}
              title={isArchived ? "Restore" : "Archive"}
              disabled={isDisabled}
              onClick={() => (isArchived ? onRestore?.(id, name) : onArchive?.(id, name))}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
