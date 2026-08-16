"use client";

/**
 * ImprovementsRail — the RIGHT rail of the improvement workspace: every
 * proposal the reviewer has made for this agent, grouped by whether it still
 * needs a decision, plus the version ladder showing what applying them built.
 *
 * Reuses the canonical `FindingCard` (Apply / Reject / evidence doors / replay
 * verdicts); "Guide" routes into the center chat via `onGuide` instead of
 * expanding an inline panel.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Finding } from "../types";
import { FindingCard } from "../components/FindingCard";
import { VersionLadder } from "./VersionLadder";

const OPEN_STATUSES = new Set(["proposed", "evidencing", "ready"]);

export function ImprovementsRail({
  agentId,
  findings,
  onChanged,
  onGuide,
}: {
  agentId: string;
  findings: Finding[];
  onChanged: () => void;
  onGuide: (finding: Finding) => void;
}) {
  const open = findings.filter((f) => OPEN_STATUSES.has(f.status));
  const decided = findings.filter((f) => !OPEN_STATUSES.has(f.status));
  const [showDecided, setShowDecided] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Waiting for you ({open.length})
          </div>
          {open.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-center">
              <Lightbulb className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing to decide right now. New proposals land here after a
                review — or when you guide the reviewer in the conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {open.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  onChanged={onChanged}
                  onGuide={onGuide}
                />
              ))}
            </div>
          )}
        </section>

        {decided.length > 0 && (
          <section>
            <button
              type="button"
              className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
              onClick={() => setShowDecided((v) => !v)}
            >
              {showDecided ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Decided ({decided.length})
            </button>
            <div className={cn("space-y-2", !showDecided && "hidden")}>
              {decided.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  onChanged={onChanged}
                  onGuide={onGuide}
                />
              ))}
            </div>
          </section>
        )}

        <section className="border-t border-border pt-3">
          <VersionLadder agentId={agentId} findings={findings} />
        </section>
      </div>
    </div>
  );
}
