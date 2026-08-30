"use client";

// features/agents/mandates/workspace/Section.tsx
//
// The workspace's section chrome (ShortcutEditorNext anatomy — eyebrow title,
// calm body). It lived inside MandateWorkspace until a section that decides for
// itself whether it exists at all (RunThisJobSection, super-admin gated) needed
// to own its own heading — a section that renders its title and then nothing is
// worse than no section. ONE definition, imported by both.

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        {hint ? (
          <span className="text-[11px] text-muted-foreground/70">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
