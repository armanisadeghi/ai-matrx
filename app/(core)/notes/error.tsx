"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotesV2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-6">
        <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {error.message || "An unexpected error occurred while loading notes."}
        </p>
        <Button onClick={reset} variant="outline" size="sm">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
