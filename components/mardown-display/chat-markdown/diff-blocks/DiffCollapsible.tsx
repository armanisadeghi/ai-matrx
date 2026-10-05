/**
 * Minimal VS Code-style Collapsible for Diffs
 * 
 * Ultra-tight, professional collapsible component designed specifically
 * for code diffs. Much smaller and more compact than ChatCollapsibleWrapper.
 * 
 * Features:
 * - Collapsed preview mode (shows first N lines)
 * - Diff statistics (+/- counts)
 * - Smooth expand/collapse with fade effect
 */

'use client';

import React, { useState, ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, DisclosureHeader, Badge } from "@ai-matrx/design-system/controls";

interface DiffCollapsibleProps {
  icon: ReactNode;
  title: string;
  initialOpen?: boolean;
  children: ReactNode;
  className?: string;
  // Diff statistics (VSCode style)
  additions?: number;
  deletions?: number;
  // Preview mode - shows first N lines when collapsed
  previewContent?: ReactNode;
  showPreview?: boolean;
  /** Optional element pinned to the right of the header, OUTSIDE the toggle
   * button (so it can be interactive — e.g. an admin chip). */
  headerRight?: ReactNode;
}

/**
 * Minimal, VS Code-inspired collapsible for diff blocks
 */
export const DiffCollapsible: React.FC<DiffCollapsibleProps> = ({
  icon,
  title,
  initialOpen = false,
  children,
  className,
  additions,
  deletions,
  previewContent,
  showPreview = false,
  headerRight,
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <div className={cn('border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden my-2', className)}>
      {/* Ultra-minimal header - VS Code style */}
      <div className="flex items-center bg-muted/30">
      <DisclosureHeader
        className="w-full"
        open={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        variant="label"
        icon={icon}
        title={title}
        end={
          additions !== undefined || deletions !== undefined ? (
            <>
              {additions !== undefined && additions > 0 && <Badge tone="success">+{additions}</Badge>}
              {deletions !== undefined && deletions > 0 && <Badge tone="destructive">-{deletions}</Badge>}
            </>
          ) : undefined
        }
        className="min-w-0 flex-1"
      />
      {headerRight && <div className="shrink-0 px-2">{headerRight}</div>}
      </div>

      {/* Content - with preview support */}
      <div className={cn(
        'transition-all duration-200 ease-in-out',
        isOpen ? 'max-h-[2000px] opacity-100' : showPreview ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
      )}>
        {isOpen ? (
          // Full content when expanded
          <div className="overflow-auto">
            {children}
          </div>
        ) : showPreview && previewContent ? (
          // Preview content when collapsed
          <div className="relative overflow-hidden">
            {previewContent}
            {/* Fade effect at bottom with expand button */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900 via-white/80 dark:via-zinc-900/80 to-transparent pointer-events-none">
              {/* Expand button - clickable overlay */}
              <Button variant="quiet" icon={<ChevronDown />} onClick={() => setIsOpen(true)} aria-label="Expand diff" className="absolute bottom-1 left-1/2 pointer-events-auto w-full" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

