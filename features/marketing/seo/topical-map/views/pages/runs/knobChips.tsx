"use client";

// features/marketing/seo/topical-map/views/pages/runs/knobChips.tsx
//
// THE SETTINGS A RUN OBEYS AND THIS SCREEN DOES NOT SET. Every ceiling, floor,
// batch size and stop rule is an organization knob (`useTopicalMapKnobs`, read
// once by the workspace and handed down through `PagesWorkspaceContext`), so the
// popover shows them as READ-ONLY chips: the person can see exactly what the run
// will do without this screen owning — or copying — a single one of the values.
//
// 🚨 NOT DEFAULTS. A number typed into a run's own box overrides the knob for
// that press only; these chips are what happens otherwise, which is why they are
// never rendered as editable fields and never pre-filled into one.

export interface KnobChip {
  /** The knob's own key, as an administrator sees it in settings. */
  key: string;
  /** Its live value, already stringified by the caller. */
  value: string;
}

export function KnobChips({
  title,
  chips,
}: {
  title: string;
  chips: readonly KnobChip[];
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <ul className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
          >
            <span className="font-mono">{chip.key}</span>
            <span className="mx-1 text-border">·</span>
            <span className="text-foreground">{chip.value}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        These are the organization&rsquo;s map settings. This run obeys them
        unless a box above names something else for this press.
      </p>
    </div>
  );
}
