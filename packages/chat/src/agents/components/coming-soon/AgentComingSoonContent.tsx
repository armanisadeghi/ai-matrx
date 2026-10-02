"use client";

import type { LucideIcon } from "lucide-react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentComingSoonContentProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  agentId?: string | null;
  bullets?: string[];
  className?: string;
}

export function AgentComingSoonContent({
  icon: Icon = Flame,
  title,
  description,
  agentId,
  bullets,
  className,
}: AgentComingSoonContentProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-full min-h-0 px-8 py-10 text-center overflow-y-auto",
        className,
      )}
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
        <Icon className="w-7 h-7" />
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Coming Soon
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground leading-relaxed mb-4">
        {description}
      </p>
      {bullets && bullets.length > 0 && (
        <ul className="text-left max-w-md w-full text-xs text-muted-foreground space-y-1.5 mb-4">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {agentId && (
        <p className="text-[10px] font-mono text-muted-foreground/60">
          Agent: {agentId.slice(0, 8)}…
        </p>
      )}
    </div>
  );
}
