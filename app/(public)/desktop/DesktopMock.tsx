import {
  AudioLines,
  Workflow,
  Boxes,
  Code2,
  FolderOpen,
  MessageCircle,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RAIL = [
  { label: "Chat", icon: MessageCircle, live: false },
  { label: "Agents", icon: Workflow, live: false },
  { label: "Models", icon: Boxes, live: false },
  { label: "Code", icon: Code2, live: true },
  { label: "Files", icon: FolderOpen, live: false },
  { label: "Audio", icon: AudioLines, live: true },
  { label: "Computer", icon: Monitor, live: true },
] as const;

const TOOLS = [
  "Screen",
  "Windows",
  "Keyboard and mouse",
  "Clipboard",
  "Processes",
  "Folder watch",
] as const;

/** A drawn stand-in for the app window, built from the app's real navigation. Not a screenshot. */
export function DesktopMock() {
  return (
    <div
      role="img"
      aria-label="Illustration of the Matrx Desktop window: a left rail with Chat, Agents, Models, Code, Files, Audio and Computer, and the Computer area listing the tools an agent can use on your machine."
      className="relative mx-auto w-full max-w-xl"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-primary/25 via-violet-500/10 to-cyan-400/20 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-destructive/80" />
          <span className="h-3 w-3 rounded-full bg-warning/80" />
          <span className="h-3 w-3 rounded-full bg-success/80" />
        </div>
        <div className="flex min-h-[19rem] sm:min-h-[22rem]">
          <div className="flex w-[4.5rem] shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-2 sm:w-24">
            {RAIL.map(({ label, icon: Icon, live }) => (
              <div
                key={label}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 type-meta font-medium",
                  label === "Computer"
                    ? "bg-primary/12 text-primary"
                    : live
                      ? "text-foreground/80"
                      : "text-muted-foreground/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <p className="type-body font-bold">Computer</p>
            <p className="mt-0.5 type-secondary text-muted-foreground">
              What your agents can use on this machine
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {TOOLS.map((tool) => (
                <div
                  key={tool}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2.5 type-secondary font-medium"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span className="truncate">{tool}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div className="h-2 w-2/3 rounded bg-primary/30" />
              <div className="mt-2 h-2 w-full rounded bg-primary/15" />
              <div className="mt-1.5 h-2 w-4/5 rounded bg-primary/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
