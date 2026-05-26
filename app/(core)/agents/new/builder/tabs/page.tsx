import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Layout } from "lucide-react";
import { ComprehensiveBuilder } from "@/features/agents/agent-creators/interactive-builder/ComprehensiveBuilder";

export const metadata = { title: "Comprehensive Agent Builder | AI Matrx" };

export default function TabsBuilderPage() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Link href="/agents/new/builder">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layout className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Comprehensive Builder
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ComprehensiveBuilder />
      </div>
    </div>
  );
}
