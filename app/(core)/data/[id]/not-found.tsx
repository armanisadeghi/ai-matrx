"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="w-full h-full overflow-hidden flex flex-col items-center justify-center bg-muted/40 p-8 pt-[var(--shell-header-h)] rounded-lg">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Table Not Found
        </h2>
        <p className="text-muted-foreground mb-6">
          The table you're looking for doesn't exist or you don't have
          permission to view it.
        </p>
        <Button onClick={() => router.push("/data")}>Return to Tables</Button>
      </div>
    </div>
  );
}
