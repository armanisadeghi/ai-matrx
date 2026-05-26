import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Wrench } from "lucide-react";
import { AgentBuilderPicker } from "@/features/agents/agent-creators/interactive-builder/AgentBuilderPicker";

export const metadata = { title: "Interactive Agent Builder | AI Matrx" };

export default function InteractiveBuilderPage() {
  return (
    <Card className="h-full w-full bg-textured border-none shadow-lg">
      <div className="p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="flex items-start gap-3 mb-6">
          <Link href="/agents/new">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-accent h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1">
              Build Interactively
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a builder tool to create your agent step-by-step.
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <AgentBuilderPicker />
        </div>
      </div>
    </Card>
  );
}
