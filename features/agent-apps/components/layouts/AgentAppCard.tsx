"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Gem } from "lucide-react";
import type { AgentApp, AgentAppSummary, PublicAgentApp } from "../../types";

type CardApp = AgentApp | PublicAgentApp | AgentAppSummary;

interface AgentAppCardProps {
  app: CardApp;
  href?: string;
  onClick?: (app: CardApp) => void;
}

export function AgentAppCard({ app, href, onClick }: AgentAppCardProps) {
  const body = (
    <div className="group h-full flex flex-col gap-2 p-4 bg-card border border-border rounded-lg hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center">
          <Gem className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">
            {app.name}
          </div>
          {app.tagline && (
            <div className="text-xs text-muted-foreground truncate">
              {app.tagline}
            </div>
          )}
        </div>
      </div>
      {app.description && (
        <p className="text-xs text-muted-foreground line-clamp-3">
          {app.description}
        </p>
      )}
      <div className="mt-auto pt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {typeof app.total_executions === "number" ? app.total_executions : 0}{" "}
          runs
        </span>
        <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Open
          <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick?.(app)}
      className="block h-full w-full text-left"
    >
      {body}
    </button>
  );
}
