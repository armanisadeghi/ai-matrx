import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Zap } from "lucide-react";
import { InstantAssistantBuilder } from "@/features/agents/agent-creators/interactive-builder/InstantAssistantBuilder";

export const metadata = { title: "Instant Chat Assistant Builder | AI Matrx" };

export default function InstantBuilderPage() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Link href="/agents/new/builder">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Instant Chat Assistant
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <InstantAssistantBuilder />
      </div>
    </div>
  );
}
