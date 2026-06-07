"use client";

/**
 * ProjectDetails — the read-only identity facts for a project: UUID, slug, and
 * created date. Each value renders as small monospace text that NEVER truncates
 * (it wraps / scrolls horizontally) with a copy-to-clipboard button.
 *
 * Used on the Manage page (as a Details card) and alongside the references panel.
 * `CopyValue` is the tiny copy primitive: it swaps the icon to a Check for ~1.5s
 * and fires a success toast. It mirrors the existing copy-button behaviour
 * without dragging in the heavier `agent-copy` payload machinery, which is meant
 * for "copy a whole record for an AI agent", not for copying a single id.
 */

import React from "react";
import { format } from "date-fns";
import { Check, Copy, Fingerprint, Link2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import type { Project } from "../types";

function CopyValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-xs text-foreground/90 overflow-x-auto whitespace-nowrap",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
      </div>
      <CopyValue value={value} label={label} />
    </div>
  );
}

export function ProjectDetails({ project }: { project: Project }) {
  const created = project.createdAt
    ? format(new Date(project.createdAt), "MMMM d, yyyy 'at' h:mm a")
    : "—";

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      <DetailRow icon={Fingerprint} label="Project ID" value={project.id} />
      {project.slug && (
        <DetailRow icon={Link2} label="Slug" value={project.slug} />
      )}
      <DetailRow
        icon={CalendarDays}
        label="Created"
        value={created}
        mono={false}
      />
    </div>
  );
}
