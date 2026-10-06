"use client";

import React from "react";
import Link from "next/link";
import { Stars } from "lucide-react";
import type { AgentApp, PublicAgentApp } from "../../types";

interface AgentAppListItemProps {
  app: AgentApp | PublicAgentApp;
  href?: string;
  onClick?: (app: AgentApp | PublicAgentApp) => void;
  trailing?: React.ReactNode;
}

export function AgentAppListItem({
  app,
  href,
  onClick,
  trailing,
}: AgentAppListItemProps) {
  const body = (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-md transition-colors">
      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 text-primary-ink inline-flex items-center justify-center">
        <Stars className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {app.name}
        </div>
        {app.tagline && (
          <div className="text-xs text-muted-foreground truncate">
            {app.tagline}
          </div>
        )}
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  );

  if (href) {
    return <Link href={href}>{body}</Link>;
  }
  return (
    <button
      type="button"
      onClick={() => onClick?.(app)}
      className="w-full text-left"
    >
      {body}
    </button>
  );
}
