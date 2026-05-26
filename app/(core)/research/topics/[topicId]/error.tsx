"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TopicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Topic Error]", error);
  }, [error]);

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Failed to load topic</h2>
        <p className="text-sm text-muted-foreground">
          There was a problem loading this research topic. The data may be
          temporarily unavailable.
          {error.digest && (
            <span className="block text-xs text-muted-foreground mt-1">
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link href="/research/topics">
              <ArrowLeft className="h-3.5 w-3.5" />
              All Topics
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
