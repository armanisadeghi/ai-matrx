"use client";

/**
 * DiffViewer Component
 * 
 * Displays a single diff with before/after preview and accept/reject controls
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, FileText, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PendingDiff } from '../types';

export interface DiffViewerProps {
  diff: PendingDiff;
  onAccept: (diffId: string) => void;
  onReject: (diffId: string) => void;
  showLineNumbers?: boolean;
  className?: string;
}

export function DiffViewer({
  diff,
  onAccept,
  onReject,
  showLineNumbers = false,
  className,
}: DiffViewerProps) {
  const isLineRange = diff.diff.type === 'line-range';

  return (
    <Card className={cn('p-4 space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLineRange ? (
            <Hash className="h-4 w-4 text-blue-500" />
          ) : (
            <FileText className="h-4 w-4 text-purple-500" />
          )}
          <Badge variant="outline" className="text-xs">
            {isLineRange ? 'Line Range' : 'Search & Replace'}
          </Badge>
          {isLineRange && diff.preview.lineRange && (
            <span className="text-xs text-muted-foreground">
              Lines {diff.preview.lineRange.start}–{diff.preview.lineRange.end}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            icon={<X />}
            variant="quiet"
            onClick={() => onReject(diff.id)}
          >
            Reject
          </Button>
          <Button
            icon={<Check />}
            variant="primary"
            onClick={() => onAccept(diff.id)}
          >
            Accept
          </Button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="grid gap-2">
        {/* Before */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-red-600 dark:text-red-400">
              − BEFORE
            </div>
            <div className="flex-1 border-t border-red-200 dark:border-red-800" />
          </div>
          <div className="relative">
            <pre className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3 overflow-x-auto">
              <code className="text-red-900 dark:text-red-100">
                {diff.preview.before}
              </code>
            </pre>
          </div>
        </div>

        {/* After */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-green-600 dark:text-green-400">
              + AFTER
            </div>
            <div className="flex-1 border-t border-green-200 dark:border-green-800" />
          </div>
          <div className="relative">
            <pre className="text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 overflow-x-auto">
              <code className="text-green-900 dark:text-green-100">
                {diff.preview.after}
              </code>
            </pre>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
        <span>ID: {diff.id}</span>
        <span>
          {new Date(diff.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </Card>
  );
}

