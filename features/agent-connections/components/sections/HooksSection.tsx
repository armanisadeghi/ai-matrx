"use client";

import React, { useState } from "react";
import { Zap } from "lucide-react";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { getComingSoon } from "@/lib/coming-soon/registry";

// The promise text is READ from the registry — deleting the entry when hooks
// ship forces this copy to change with it (CLAUDE.md § Coming Soon).
const COMING_SOON = getComingSoon("agent-connections.hooks");

export function HooksSection() {
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Generate Hook"
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center max-w-sm px-8 py-12">
          <Zap className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-sm font-semibold text-foreground mt-2">
            {COMING_SOON?.label ?? "Agent Hooks"} — coming soon
          </h3>
          <p className="text-sm text-muted-foreground">
            {COMING_SOON?.promise}
          </p>
        </div>
      </div>
      <SectionFooter
        description="Prompts executed at specific points during an agentic lifecycle."
        learnMoreLabel="Learn more about hooks"
        learnMoreHref="#"
      />
    </div>
  );
}

export default HooksSection;
