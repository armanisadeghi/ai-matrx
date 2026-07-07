"use client";

// features/education/tutor/components/TutorHome.tsx
//
// The /education/tutor home — a LIST view (per the education doctrine: feature
// entry pages are lists, not a forced single workspace). Start a new tutor
// session, or resume any past conversation. The history list is the canonical
// ConversationHistorySidebar filtered to the education-tutor source_feature, so
// it never drifts from /chat's list behavior.

import Link from "next/link";
import { GraduationCap, Plus, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DEFAULT_TUTOR_AGENT_ID } from "../agents";
import { TutorSettingsPanel } from "./TutorSettingsPanel";

export function TutorHome() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {/* Hero */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold text-foreground">AI Tutor</h1>
              <p className="text-sm text-muted-foreground">
                A personal tutor that remembers what you&apos;ve studied, grounds
                its answers in your own material, and is honest about what it
                doesn&apos;t know.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" aria-hidden />
              Cites your material
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Remembers your progress
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/education/tutor/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New tutor session
            </Link>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings2 className="h-4 w-4" aria-hidden />
                  Tutor style
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <TutorSettingsPanel />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* History */}
        <div className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            Your tutor conversations
          </h2>
          <div className="min-h-[240px] rounded-2xl border border-border bg-card p-2">
            <ConversationHistorySidebar
              scopeId="education-tutor"
              agentIds={[DEFAULT_TUTOR_AGENT_ID]}
              surfaceId="education-tutor"
              variant="consumer"
              getConversationHref={(c) => `/education/tutor/${c.conversationId}`}
              emptyState={
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No tutor conversations yet. Start one above — ask about
                  anything you&apos;re studying.
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
