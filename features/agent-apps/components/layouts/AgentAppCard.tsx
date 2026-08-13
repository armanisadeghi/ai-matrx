"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Gem } from "lucide-react";
import type { AgentApp, AgentAppSummary, PublicAgentApp } from "../../types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanAgentApp } from "../../format";

type CardApp = AgentApp | PublicAgentApp | AgentAppSummary;

interface AgentAppCardProps {
  app: CardApp;
  href?: string;
  onClick?: (app: CardApp) => void;
}

export function AgentAppCard({ app, href, onClick }: AgentAppCardProps) {
  const body = (
    <div className="group h-full flex flex-col gap-2 p-4 bg-card border border-border rounded-lg hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-start gap-2 pr-14">
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

  // The card body is wrapped in a <Link>/<button> below, so the copy pair is
  // a sibling overlay in a relative wrapper — never nested inside the
  // clickable element (a nested interactive element is invalid HTML and
  // would also double-fire the card's navigation on copy clicks).
  return (
    <div className="group/x relative h-full">
      {href ? (
        <Link href={href} className="block h-full">
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onClick?.(app)}
          className="block h-full w-full text-left"
        >
          {body}
        </button>
      )}
      <CopyButtons
        size="xs"
        label={app.name}
        className="absolute top-2 right-2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
        human={() => humanAgentApp(app)}
        json={() => app}
        agent={() => ({
          kind: "agent-app",
          location: "AI Matrx — Agent Apps",
          description: "A single agent-app card.",
          data: app,
          summary: humanAgentApp(app),
          attributes: { id: app.id, status: "status" in app ? app.status : undefined },
        })}
      />
    </div>
  );
}
