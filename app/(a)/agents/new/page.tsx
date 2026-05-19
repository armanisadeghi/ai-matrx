import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Plus,
  Rocket,
  Wrench,
  Upload,
  LayoutPanelTop
} from "lucide-react";

const CREATION_OPTIONS = [
  {
    href: "/agents/new/manual",
    icon: Plus,
    iconClass: "text-primary",
    title: "Create Manually",
    description: "Start from a starter template and customize your agent",
    gradient: "from-primary/5 to-primary/10",
  },
  {
    href: "/agents/new/generate",
    icon: Rocket,
    iconClass: "text-purple-600 dark:text-purple-400",
    title: "Generate with AI",
    description: "Let AI create an agent based on your exact requirements",
    gradient: "from-purple-500/5 to-blue-500/10",
  },
  {
    href: "/agents/new/builder",
    icon: Wrench,
    iconClass: "text-green-600 dark:text-green-400",
    title: "Build Interactively",
    description:
      "Use the guided builder for a step-by-step experience",
    gradient: "from-green-500/5 to-emerald-500/10",
  },
  {
    href: "/agents/new/import",
    icon: Upload,
    iconClass: "text-blue-600 dark:text-blue-400",
    title: "Import Agent",
    description:
      "Import an existing agent configuration from a JSON file",
    gradient: "from-blue-500/5 to-cyan-500/10",
  },
  {
    href: "/agents/templates",
    icon: LayoutPanelTop,
    iconClass: "text-secondary-foreground",
    title: "Use Template",
    description:
      "Start with a pre-built template from the templates library",
    gradient: "from-secondary/5 to-accent/10",
  },
] as const;

export default function NewAgentPage() {
  return (
    <Card className="h-full w-full bg-textured border-none shadow-lg">
      <div className="p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="flex items-start gap-2.5 sm:gap-3 md:gap-4 mb-6 sm:mb-8">
          <Link href="/agents">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-accent h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1 sm:mb-2">
              Create New Agent
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose how you want to create your new AI agent.
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto space-y-2.5">
          {CREATION_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Link
                key={option.href}
                href={option.href}
                className={`group relative overflow-hidden block w-full rounded-xl p-4 text-left transition-all duration-200
                  bg-gradient-to-br hover:brightness-105
                  border border-border/50 hover:border-border
                  shadow-md hover:shadow-xl
                  ${option.gradient}`}
              >
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex-shrink-0 p-2.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm">
                    <Icon className={`h-5 w-5 ${option.iconClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {option.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
