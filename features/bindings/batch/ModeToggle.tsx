"use client";

// features/bindings/batch/ModeToggle.tsx
//
// ONE SCREEN, TWO MODES. The rung and the holder chosen in the bar above hold
// still; only the shape of the match changes — one place at a time, or many at
// once. That is the thing the shortcut batch grid gets right and the mandate
// system had nowhere (P17), and it is a MODE rather than a route precisely so
// nobody has to re-choose who this is for on the way there.

export type BindingMode = "map" | "batch";

export function ModeToggle({
  mode,
  onChange,
  disabled = false,
  placeCount,
}: {
  mode: BindingMode;
  onChange: (next: BindingMode) => void;
  disabled?: boolean;
}) {
  const options: ReadonlyArray<[BindingMode, string]> = [
    ["map", "Map one place"],
    ["batch", "Map many places"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-3 py-2">
      <div
        className="flex items-center rounded-md border border-border p-0.5"
        role="group"
        aria-label="How much to map"
      >
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={mode === key}
            onClick={() => onChange(key)}
            className={
              mode === key
                ? "rounded bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary"
                : "rounded px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Same rows, same four sources, same validation — the rung and the holder
        above apply to every place.
      </p>
    </div>
  );
}
