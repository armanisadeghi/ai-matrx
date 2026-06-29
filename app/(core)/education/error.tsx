"use client";

// Error boundary for the Education Hub. Loud recovery — surfaces the failure
// and offers a retry instead of a blank screen.
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EducationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[education] route error:", error);
  }, [error]);

  return (
    <div className="min-h-full w-full bg-textured flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-5 rounded-2xl border border-border bg-card p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t load this part of the Education Hub. Try again, or
            head back to the hub.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/education">
              <Home className="h-4 w-4" />
              Education Hub
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
