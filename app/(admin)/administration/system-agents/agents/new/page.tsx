import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "New System Agent | Admin" };

const CREATION_OPTIONS = [
  {
    href: "/administration/system-agents/agents/new/manual",
    icon: Plus,
    iconClass: "text-primary",
    title: "Create Manually",
    description:
      "Start from a blank starter template, then edit in the system agent builder.",
    gradient: "from-primary/5 to-primary/10",
  },
] as const;

export default function NewSystemAgentChoicePage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        <Link href="/administration/system-agents/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to system agents
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            New System Agent
          </h1>
          <p className="text-xs text-muted-foreground">
            Pick how you want to create this builtin. The agent will be visible
            to every user once created.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6 max-w-2xl space-y-2.5">
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

          <Card className="mt-6 border-dashed">
            <div className="p-4 text-xs text-muted-foreground space-y-1.5">
              <div className="font-medium text-foreground text-sm">
                Promoting a user agent instead?
              </div>
              <p>
                If a user has already built and tested an agent that should
                become a builtin, open it in the user-side builder, then use the
                options menu &rarr; <strong>Convert to System Agent</strong>.
                That preserves a link back to the source agent for future
                refresh.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
