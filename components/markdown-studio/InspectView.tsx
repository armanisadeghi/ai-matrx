// components/markdown-studio/InspectView.tsx
// The studio's ADMIN-ONLY Inspect view — the developer tools the dev demos
// carried, now over the studio's own buffer:
//   Server events — the raw NDJSON server events, "Include raw_content",
//                   and replay of the captured server events at a delay
//                   (ServerEventInspector, the same component the
//                   block-processing demo page renders).
//   Processors    — the markdown-classification coordinator / processor /
//                   config / view pipeline with its AST output
//                   (MarkdownClassificationTester, the same component the
//                   split-screen demo renders).
// Shown only in the admin lane (the tester route); never on a user page.

"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Cpu, Network } from "lucide-react";
import { cn } from "@/lib/utils";

const ServerEventInspector = dynamic(() => import("./lab/ServerEventInspector"), { ssr: false });
const MarkdownClassificationTester = dynamic(
  () => import("@/components/mardown-display/markdown-classification/MarkdownClassificationTester"),
  { ssr: false },
);

const PANES = [
  { id: "server", label: "Server events", icon: Network },
  { id: "processors", label: "Processors & AST", icon: Cpu },
] as const;
type Pane = (typeof PANES)[number]["id"];

export function InspectView({ content }: { content: string }) {
  const [pane, setPane] = useState<Pane>("server");
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-1.5">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5">
            {PANES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPane(p.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors lg:min-h-0",
                  pane === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <p.icon className="h-3 w-3" />
                {p.label}
              </button>
            ))}
          </div>
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {content.length.toLocaleString()} chars from the editor
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {pane === "server" ? (
            <ServerEventInspector content={content} />
          ) : (
            // Seeded from the buffer each time the pane opens.
            <MarkdownClassificationTester initialMarkdown={content} />
          )}
        </div>
      </div>
    </div>
  );
}
