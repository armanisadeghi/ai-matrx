"use client";

import { Pencil } from "lucide-react";
import { FieldHelp } from "@ai-matrx/design-system/controls";
import { InfoHint } from "@/components/official/InfoHint";

// features/mandates/workspace/Section.tsx
//
// The workspace's section chrome (ShortcutEditorNext anatomy — eyebrow title,
// calm body). It lived inside MandateWorkspace until a section that decides for
// itself whether it exists at all (the super-admin-gated run panel, since moved
// to the admin Test tab) needed to own its own heading — a section that renders
// its title and then nothing is worse than no section. ONE definition, shared.

export function Section({
  title,
  hint,
  info,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  /** One-sentence definition shown behind an info icon beside the title. */
  info?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {info ? (
          <div className="flex items-center gap-1.5">
            <h3 className="type-title text-foreground">{title}</h3>
            <InfoHint label={`About ${title}`} text={info} />
          </div>
        ) : (
          <h3 className="type-title text-foreground">{title}</h3>
        )}
        {hint ? <span className="type-secondary text-foreground">{hint}</span> : null}
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
  unavailable?: React.ReactNode;
}) {
  if (unavailable)
    return (
      <FieldHelp
        label={label}
        triggerLabel={`${label} — instructions`}
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
