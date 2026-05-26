import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VersionNotFound() {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="flex flex-col items-center text-center space-y-4 max-w-md">
        <div className="p-3 bg-destructive/10 rounded-full">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Version Not Found</h2>
          <p className="text-muted-foreground">
            This version doesn&apos;t exist for this agent.
          </p>
        </div>
        <Link href="/agents">
          <Button>Back to Agents</Button>
        </Link>
      </div>
    </div>
  );
}
