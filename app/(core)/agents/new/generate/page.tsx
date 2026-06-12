import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket } from "lucide-react";
import { AgentGenerator } from "@/features/agents/agent-creators/interactive-builder/AgentGenerator";


export default function GenerateAgentPage() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Link href="/agents/new">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Rocket className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          AI Agent Generator
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AgentGenerator />
      </div>
    </div>
  );
}
