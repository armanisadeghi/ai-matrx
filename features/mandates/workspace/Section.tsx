"use client";

import { Pencil } from "lucide-react";
import { FieldHelp } from "@/components/official/ConfigurationFields";

// features/mandates/workspace/Section.tsx
//
// The workspace's section chrome (ShortcutEditorNext anatomy — eyebrow title,
// calm body). It lived inside MandateWorkspace until a section that decides for
// itself whether it exists at all (RunThisJobSection, super-admin gated) needed
// to own its own heading — a section that renders its title and then nothing is
// worse than no section. ONE definition, imported by both.

export function Section({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <span className="text-xs text-foreground">{hint}</span> : null}
        {actions}
      </div>
      {children}
    </section>
  );
}

/** The same small edit affordance for every definition section. */
export function SectionEditAction({
  label,
  onEdit,
  unavailable,
}: {
  label: string;
  onEdit?: () => void;
  unavailable?: string;
}) {
  if (unavailable)
    return (
      <FieldHelp
        label={label}
        triggerLabel={`${label} (unavailable)`}
        unavailable
        triggerIcon={
          <Pencil className="size-3 opacity-40" aria-hidden="true" />
        }
      >
        {unavailable}
      </FieldHelp>
    );
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onEdit}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Pencil className="size-3" aria-hidden="true" />
    </button>
  );
}
