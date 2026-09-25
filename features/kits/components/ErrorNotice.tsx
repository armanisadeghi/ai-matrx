"use client";

import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNotice as CanonicalErrorNotice } from "@/components/errors/ErrorNotice";
import { plainError } from "../errors";

/**
 * A kit failure said plainly, with the raw text behind "Details" and an
 * optional retry. Renders THE canonical `ErrorNotice`, so it carries the
 * Alchemy Menu like every other error on screen.
 */
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
    <CanonicalErrorNotice
      title={title}
      message={sentence}
      error={error}
      className={className}
      actions={
        onRetry ? (
          <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
      {detail && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Details</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[10.5px] text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
    </CanonicalErrorNotice>
  );
}
