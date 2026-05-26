import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AgentNotFound() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <Card className="max-w-md w-full p-8 bg-textured border-destructive/30">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-destructive/10 rounded-full">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Agent Not Found</h2>
            <p className="text-muted-foreground">
              This agent doesn&apos;t exist or you don&apos;t have access to it.
            </p>
          </div>
          <Link href="/agents">
            <Button>Back to Agents</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
