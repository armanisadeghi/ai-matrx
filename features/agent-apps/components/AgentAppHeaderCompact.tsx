"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Rocket } from "lucide-react";
import type { AgentApp, PublicAgentApp } from "../types";

interface AgentAppHeaderCompactProps {
  app: AgentApp | PublicAgentApp;
  backHref?: string;
  right?: React.ReactNode;
}

export function AgentAppHeaderCompact({
  app,
  backHref,
  right,
}: AgentAppHeaderCompactProps) {
  return (
    <div className="flex-shrink-0 h-10 px-3 border-b border-border flex items-center gap-2 bg-card">
      {backHref ? (
        <Link
          href={backHref}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
      ) : (
        <div className="h-7 w-7 inline-flex items-center justify-center text-primary">
          <Rocket className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {app.name}
        </div>
        {app.tagline && (
          <div className="text-[11px] text-muted-foreground truncate leading-tight">
            {app.tagline}
          </div>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
