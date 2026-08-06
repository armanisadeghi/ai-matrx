"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Table error:", error);
  }, [error]);

  return (
    <div className="w-full h-full overflow-hidden flex flex-col items-center justify-center bg-muted/40 p-8 pt-[var(--shell-header-h)] rounded-lg">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Something went wrong
        </h2>
        <p className="text-muted-foreground mb-6">
          There was an error loading this table. Please try again or return to
          the tables list.
        </p>
        <div className="flex space-x-4 justify-center">
          <Button onClick={() => reset()} variant="secondary">
            Try again
          </Button>
          <Button onClick={() => router.push("/data")}>Return to Tables</Button>
        </div>
      </div>
    </div>
  );
}
