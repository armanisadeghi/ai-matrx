"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Research Error]", error);
  }, [error]);

  return (
    <div className="h-full flex items-center justify-center bg-textured p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred while loading research data.
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
            <Link href="/research">
              <Home className="h-3.5 w-3.5" />
              Back to Research
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
