"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Webhook,
  MessageCircle,
  NotebookPen,
  FolderOpen,
  Mic,
  FileSpreadsheet,
  FileText,
  ArrowRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import { ONBOARDING_METADATA_KEY } from "@/utils/onboarding";

interface WelcomeOption {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind gradient stops for the icon tile. */
  gradient: string;
}

const OPTIONS: WelcomeOption[] = [
  {
    label: "Organization",
    description: "Set up your team and shared workspace",
    href: "/organizations",
    icon: Building2,
    gradient: "from-sky-500 to-sky-700",
  },
  {
    label: "Agents",
    description: "Browse and run AI agents built for your work",
    href: "/agents/all",
    icon: Webhook,
    gradient: "from-blue-500 to-blue-700",
  },
  {
    label: "Chat",
    description: "Start a conversation with an AI assistant",
    href: "/chat/new",
    icon: MessageCircle,
    gradient: "from-violet-500 to-violet-700",
  },
  {
    label: "Notes",
    description: "Capture ideas and keep them organized",
    href: "/notes",
    icon: NotebookPen,
    gradient: "from-amber-500 to-amber-700",
  },
  {
    label: "Files",
    description: "Browse and manage your files and documents",
    href: "/files/all",
    icon: FolderOpen,
    gradient: "from-cyan-500 to-cyan-700",
  },
  {
    label: "Transcripts",
    description: "Record, transcribe, and manage audio",
    href: "/transcripts",
    icon: Mic,
    gradient: "from-orange-500 to-orange-700",
  },
  {
    label: "Workbooks",
    description: "Build structured, data-driven workbooks",
    href: "/workbooks",
    icon: FileSpreadsheet,
    gradient: "from-emerald-500 to-emerald-700",
  },
  {
    label: "Documents",
    description: "Create and collaborate on documents",
    href: "/documents",
    icon: FileText,
    gradient: "from-rose-500 to-rose-700",
  },
];

export function WelcomeClient({ firstName }: { firstName: string | null }) {
  const router = useRouter();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [isNavPending, startNav] = useTransition();
  const [finishing, setFinishing] = useState(false);

  const busy = isNavPending || finishing;

  function go(href: string) {
    if (busy) return;
    setNavigatingTo(href);
    startNav(() => {
      router.push(href);
    });
  }

  async function finishOnboarding() {
    if (busy) return;
    setFinishing(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { [ONBOARDING_METADATA_KEY]: true },
      });
      if (error) {
        toast.error(`Could not save your progress: ${error.message}`);
        setFinishing(false);
        return;
      }
      startNav(() => {
        router.push("/dashboard");
        router.refresh();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setFinishing(false);
    }
  }

  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-10">
        <header className="text-center">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {firstName ? `Welcome, ${firstName}` : "Welcome to AI Matrx"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Pick a place to start. You can explore everything else later.
          </p>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const isTarget = navigatingTo === option.href && isNavPending;
            return (
              <button
                key={option.href}
                type="button"
                onClick={() => go(option.href)}
                disabled={busy}
                className="group relative flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[22%] bg-gradient-to-br ${option.gradient} text-white shadow-sm ring-1 ring-white/10`}
                >
                  {isTarget ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
