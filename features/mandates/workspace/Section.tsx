"use client";

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
