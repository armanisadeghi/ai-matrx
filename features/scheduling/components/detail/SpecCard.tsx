// features/scheduling/components/detail/SpecCard.tsx

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Code, Rocket, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SURFACE_META } from "../../constants/surfaces";
import type { AgendaTask } from "../../types";

interface Props {
  task: AgendaTask;
}

export function SpecCard({ task }: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  const varEntries = Object.entries(task.variables);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <SectionTitle icon={Rocket} label="Agent" />
        <Row label="Agent">
          <span className="font-mono text-xs">
            {task.agentId ?? "Platform default"}
          </span>
        </Row>

        <SectionTitle icon={Code} label="Prompt" />
        <button
          onClick={() => setPromptOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {promptOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {promptOpen ? "Hide" : "Show"} prompt ({task.prompt.length} chars)
        </button>
        {promptOpen && (
          <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
            {task.prompt}
          </pre>
        )}

        {varEntries.length > 0 && (
          <>
            <SectionTitle icon={Code} label="Variables" />
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              {varEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="font-mono text-muted-foreground">{k}</span>
                  <span className="font-mono break-all">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <SectionTitle icon={Settings} label="Execution" />
        <Row label="Surfaces">
          <div className="flex flex-wrap gap-1">
            {task.surfaces.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">
                {SURFACE_META[s]?.label ?? s}
              </Badge>
            ))}
          </div>
        </Row>
        <Row label="Auth mode">
          <Badge variant="outline" className="capitalize text-xs">
            {task.authMode}
          </Badge>
          <span className="text-xs text-muted-foreground ml-2">
            {task.authMode === "ask"
              ? "Shows a notification — user clicks to run."
              : "Runs immediately when due."}
          </span>
        </Row>
        <Row label="Max runtime">
          <span className="text-sm">{task.maxRuntimeSeconds}s</span>
        </Row>
        <Row label="Max concurrent">
          <span className="text-sm">{task.maxConcurrent}</span>
        </Row>
        {task.persistentConversationId && (
          <Row label="Conversation">
            <span className="font-mono text-xs">
              {task.persistentConversationId}
            </span>
          </Row>
        )}
        {task.tags.length > 0 && (
          <Row label="Tags">
            <div className="flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          </Row>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  label,
}: {
  icon: typeof Rocket;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" /> {label}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] sm:grid-cols-[8rem_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
