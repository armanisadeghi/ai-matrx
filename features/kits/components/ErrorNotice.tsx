"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { plainError } from "../errors";

/** A failure said plainly, with the raw text behind "Details" and an optional retry. */
export function ErrorNotice({
  title,
  error,
  onRetry,
  retryLabel = "Try again",
  children,
  className,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { sentence, detail } = plainError(error);
  return (
    <div className={cn("rounded-lg border border-destructive/20 bg-destructive/5 p-3", className)}>
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        {title}
      </p>
      <p className="mt-1 break-words pl-6 text-xs text-muted-foreground">{sentence}</p>
      {children && <div className="mt-1 pl-6 text-xs text-muted-foreground">{children}</div>}
      {detail && (
        <details className="mt-1.5 pl-6">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Details</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[10.5px] text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
      {onRetry && (
        <Button size="sm" variant="outline" className="ml-6 mt-2" onClick={onRetry}>
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
