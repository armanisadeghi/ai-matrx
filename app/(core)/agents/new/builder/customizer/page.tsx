import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sliders } from "lucide-react";
import { ExperienceCustomizerBuilder } from "@/features/agents/agent-creators/interactive-builder/ExperienceCustomizerBuilder";

export const metadata = { title: "AI Experience Customizer | AI Matrx" };

export default function CustomizerBuilderPage() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Link href="/agents/new/builder">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sliders className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          AI Experience Customizer
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ExperienceCustomizerBuilder />
      </div>
    </div>
  );
}
