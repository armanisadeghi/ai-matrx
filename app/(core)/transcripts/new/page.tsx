// app/(core)/transcripts/new/page.tsx
//
// "How do you want to create one?" picker. Mirrors `/agents/new`: a
// short grid of options, each handing off to the right workspace.
// Server component — no client state needed.

import Link from "next/link";
import { ArrowLeft, Columns2, FileUp, Import, Mic, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { redirect } from "next/navigation";
interface CreationOption {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: "Live" | "Coming soon";
}

const OPTIONS: CreationOption[] = [
  {
    href: "/transcripts/processor?action=upload",
    title: "Upload audio / video",
    description:
      "Drag in a file (MP3, WAV, MP4, etc.) and we'll transcribe it via Groq Whisper. Best for recordings you already have.",
    icon: FileUp,
  },
  {
    href: "/transcripts/processor?action=record",
    title: "Record now",
    description:
      "Record from your mic right inside the processor. Live transcription, save when done.",
    icon: Mic,
  },
  {
    href: "/transcripts/studio",
    title: "Open in Studio",
    description:
      "Long-session live workspace — 4 columns (raw → cleaned → concepts → modules). Best for 1–3 hr meetings, lectures.",
    icon: Columns2,
  },
  {
    href: "/transcripts/cleanup",
    title: "Open Cleanup",
    description:
      "Start the AI cleanup tool standalone — paste a raw transcript, get a polished version. No save required.",
    icon: Eraser,
  },
  {
    href: "/transcripts/processor?action=import",
    title: "Import AI transcript",
    description:
      "Paste a transcript generated elsewhere. Useful for moving content in from other tools.",
    icon: Import,
  },
];

export default async function NewTranscriptPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/transcripts");

  return (
    <div className="h-[calc(100dvh-var(--header-height,2.5rem))] w-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-5">
          <Link
            href="/transcripts"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            aria-label="Back to all transcripts"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            New transcript
          </h1>
          <span className="text-sm text-muted-foreground">
            · pick how to start
          </span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const disabled = opt.status === "Coming soon";
            const inner = (
              <div
                className={cn(
                  "h-full rounded-lg border border-border bg-card p-4",
                  "transition-all",
                  !disabled &&
                    "hover:border-primary/40 hover:bg-muted/30 cursor-pointer",
                  disabled && "opacity-60 cursor-not-allowed",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">{opt.title}</h3>
                      {opt.status === "Coming soon" && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-muted text-muted-foreground ring-1 ring-border">
                          soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {opt.description}
                    </p>
                  </div>
                </div>
              </div>
            );

            if (disabled) {
              return <li key={opt.title}>{inner}</li>;
            }
            return (
              <li key={opt.title}>
                <Link href={opt.href} className="block h-full">
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">
          Already have a transcript?{" "}
          <Link href="/transcripts" className="text-primary hover:underline">
            See all transcripts
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
